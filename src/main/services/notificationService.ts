import { app, BrowserWindow, Notification as ElectronNotification } from 'electron';
import { IPC } from '../../shared/types';
import type { UnreadUpdate } from '../../shared/types';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { WindowService } from './windowService';
import type { SettingsService } from './settingsService';
import type { ViewService } from './viewService';

/**
 * Format the title/body pair we show in the native OS notification.
 * Pure, so it's easy to unit-test.
 *
 *   format({ instanceName: 'Work', title: 'John Doe', body: 'Lunch?' })
 *     => { title: '[Nexus] Work', body: 'John Doe: Lunch?' }
 *
 * Empty source title leaves the body unchanged (no leading colon).
 */
export function formatNativeNotification(input: {
  instanceName: string;
  title: string;
  body: string;
}): { title: string; body: string } {
  const t = (input.title ?? '').trim();
  const b = (input.body ?? '').trim();
  const composedBody = t && b ? `${t}: ${b}` : t || b || '';
  return {
    title: `[Nexus] ${input.instanceName}`,
    body: composedBody,
  };
}

export class NotificationService implements Service {
  readonly name = 'notifications';
  private logger!: Logger;
  private counts = new Map<string, number>();
  private previews = new Map<string, string>();
  private windowService!: WindowService;
  private settings!: SettingsService;
  private views!: ViewService;
  private unsubscribe: (() => void)[] = [];

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('notifications');
    this.windowService = ctx.container.get<WindowService>('window');
    this.settings = ctx.container.get<SettingsService>('settings');
    this.views = ctx.container.get<ViewService>('views');

    this.unsubscribe.push(
      ctx.bus.on('notification:update', (u) => this.report(u)),
      ctx.bus.on('instance:removed', ({ instanceId }) => this.clear(instanceId)),
      ctx.bus.on('notification:native', ({ instanceId, title, body, tag }) => {
        this.showNative(instanceId, title, body, tag);
      }),
    );
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    if (process.platform === 'darwin') app.dock?.setBadge('');
  }

  private report(update: UnreadUpdate): void {
    const prev = this.counts.get(update.moduleId);
    this.counts.set(update.moduleId, update.count);
    if (update.preview) this.previews.set(update.moduleId, update.preview);
    this.broadcast(update);
    if (prev !== update.count) this.updateBadge();
  }

  private clear(moduleId: string): void {
    this.counts.delete(moduleId);
    this.previews.delete(moduleId);
    this.broadcast({ moduleId, count: 0 });
    this.updateBadge();
  }

  all(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  private broadcast(update: UnreadUpdate): void {
    const win = this.windowService.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.UNREAD_UPDATE, update);
    }
  }

  private updateBadge(): void {
    const total = [...this.counts.values()].reduce((s, n) => s + n, 0);
    if (process.platform === 'darwin') {
      app.dock?.setBadge(total > 0 ? String(total) : '');
    }
  }

  /**
   * Fire a test notification, used by the "Send test notification" button
   * in Settings. Returns true if the notification was shown, false if it was
   * suppressed (platform unsupported, no instance available, etc.). This is
   * the fastest way to verify the main → OS notification path works without
   * needing a real incoming message from a messaging service.
   */
  testNotification(instanceIdHint?: string | null): boolean {
    if (!ElectronNotification.isSupported()) {
      this.logger.warn('native notifications not supported on this platform');
      return false;
    }
    const explicit = instanceIdHint
      ? this.settings.getInstance(instanceIdHint)
      : null;
    const fallback =
      explicit ??
      (this.settings.state.activeInstanceId
        ? this.settings.getInstance(this.settings.state.activeInstanceId)
        : null) ??
      this.settings.state.instances[0] ??
      null;

    const instanceName = fallback?.name ?? 'Nexus';
    const { title, body } = formatNativeNotification({
      instanceName,
      title: 'Test notification',
      body: 'If you can see this, native notifications are working.',
    });

    try {
      const notif = new ElectronNotification({
        title,
        body,
        subtitle: process.platform === 'darwin' ? 'Nexus' : undefined,
        silent: this.settings.state.notificationSound === false,
      });
      notif.on('click', () => {
        const win = this.windowService.getWindow();
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      });
      notif.show();
      this.logger.info(`test notification shown (instance=${fallback?.id ?? 'none'})`);
      return true;
    } catch (err) {
      this.logger.warn('test notification failed', err);
      return false;
    }
  }

  /**
   * Show a native OS notification for a message received inside an embedded
   * service view. Gated on:
   *   - global settings.notificationsEnabled (default true)
   *   - Electron Notification.isSupported() for the current platform
   */
  private showNative(instanceId: string, title: string, body: string, _tag?: string): void {
    this.logger.debug(`native notification from ${instanceId}: ${title} / ${body}`);
    if (this.settings.state.notificationsEnabled === false) {
      this.logger.debug('notifications disabled in settings — suppressing');
      return;
    }
    if (!ElectronNotification.isSupported()) {
      this.logger.warn('native notifications not supported on this platform');
      return;
    }
    const instance = this.settings.getInstance(instanceId);
    if (!instance) {
      this.logger.warn(`showNative: unknown instance ${instanceId}`);
      return;
    }

    const { title: nTitle, body: nBody } = formatNativeNotification({
      instanceName: instance.name,
      title,
      body,
    });

    try {
      const notif = new ElectronNotification({
        title: nTitle,
        body: nBody,
        subtitle: process.platform === 'darwin' ? 'Nexus' : undefined,
        silent: this.settings.state.notificationSound === false,
      });
      notif.on('click', () => {
        const win = this.windowService.getWindow();
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
        try {
          this.views.activate(instanceId);
          this.settings.setActive(instanceId);
        } catch (err) {
          this.logger.warn(`notification activate failed for ${instanceId}`, err);
        }
      });
      notif.show();
    } catch (err) {
      this.logger.warn('failed to show native notification', err);
    }
  }
}
