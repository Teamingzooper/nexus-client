import { app, BrowserWindow, Notification as ElectronNotification } from 'electron';
import * as path from 'path';
import { IPC } from '../../shared/types';
import type { UnreadUpdate } from '../../shared/types';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { WindowService } from './windowService';
import type { SettingsService } from './settingsService';
import type { ProfileService } from './profileService';
import type { ViewService } from './viewService';
import type { EmailOverlayService } from './emailOverlayService';
import type { ModuleRegistryService } from './moduleRegistryService';
import { matchVip } from '../email/vipMatcher';

/**
 * Format the title/body pair we show in the native OS notification.
 * Pure, so it's easy to unit-test.
 *
 *   format({ instanceName: 'Personal', title: 'Peter Hollon', body: 'Hi' })
 *     => { title: 'Personal', body: 'Peter Hollon: Hi' }
 *
 * In privacy mode the body is replaced with the literal "New message"
 * so screen-shares / shoulder-surfers don't see content. The title
 * (instance name only) is harmless to leak.
 *
 * Empty source title leaves the body unchanged (no leading colon).
 */
export function formatNativeNotification(input: {
  instanceName: string;
  title: string;
  body: string;
  privacyMode?: boolean;
}): { title: string; body: string } {
  if (input.privacyMode) {
    return { title: input.instanceName, body: 'New message' };
  }
  const t = (input.title ?? '').trim();
  const b = (input.body ?? '').trim();
  const composedBody = t && b ? `${t}: ${b}` : t || b || '';
  return {
    title: input.instanceName,
    body: composedBody,
  };
}

/**
 * Returns true if `now` is inside a "DND window" defined by HH:MM
 * start/end in the user's local time. Handles wraparound (22:00 → 08:00
 * means "from 10pm tonight until 8am tomorrow"). Pure, easy to test.
 */
export function isInDndWindow(now: Date, startHHMM: string, endHHMM: string): boolean {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (start === null || end === null) return false;
  if (start === end) return false;
  if (start < end) {
    // Same-day window, e.g. 12:00 → 13:30.
    return minutesNow >= start && minutesNow < end;
  }
  // Wraparound, e.g. 22:00 → 08:00.
  return minutesNow >= start || minutesNow < end;
}

function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Resolve the icon to pass to a native Notification. On macOS we return
 * undefined: the OS already shows the .app bundle icon on the left, and
 * passing `icon:` adds a *second* image (the "content image") on the right.
 * On Windows/Linux the constructor `icon:` is how the icon gets set, so we
 * point at the bundled icon.png (copied to resourcesPath via extraResources
 * in packaged builds; resolved against the repo root in dev).
 */
function resolveIconPath(): string | undefined {
  if (process.platform === 'darwin') return undefined;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  // From dist/main/main/services/notificationService.js up to the repo root
  // is four levels (services → main → main → dist → repo).
  return path.join(__dirname, '..', '..', '..', '..', 'build', 'icon.png');
}

export class NotificationService implements Service {
  readonly name = 'notifications';
  private logger!: Logger;
  private counts = new Map<string, number>();
  private previews = new Map<string, string>();
  private windowService!: WindowService;
  private settings!: SettingsService;
  private profiles!: ProfileService;
  private views!: ViewService;
  private ctx!: ServiceContext;
  private unsubscribe: (() => void)[] = [];

  async init(ctx: ServiceContext): Promise<void> {
    this.ctx = ctx;
    this.logger = ctx.logger.child('notifications');
    this.windowService = ctx.container.get<WindowService>('window');
    this.settings = ctx.container.get<SettingsService>('settings');
    this.profiles = ctx.container.get<ProfileService>('profiles');
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

  /**
   * Recompute the dock badge from the current counts + mute state.
   * Used after toggling an instance's muted flag — its contribution
   * to the total just changed.
   */
  recomputeBadge(): void {
    this.updateBadge();
  }

  /**
   * Drop every tracked unread count and zero out the dock badge. Called on
   * profile switch/lock so counts from instances that are no longer visible
   * (different profile) don't inflate the dock total. The renderer also
   * gets a UNREAD_UPDATE with count: 0 for every entry so its local copy
   * can drop too.
   */
  resetCounts(): void {
    const ids = [...this.counts.keys()];
    this.counts.clear();
    this.previews.clear();
    for (const id of ids) {
      this.broadcast({ moduleId: id, count: 0 });
    }
    if (process.platform === 'darwin') {
      app.dock?.setBadge('');
    }
  }

  private broadcast(update: UnreadUpdate): void {
    const win = this.windowService.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.UNREAD_UPDATE, update);
    }
  }

  private isInDnd(): boolean {
    const s = this.settings.state;
    if (!s.dndEnabled) return false;
    if (!s.dndStart || !s.dndEnd) return false;
    return isInDndWindow(new Date(), s.dndStart, s.dndEnd);
  }

  private updateBadge(): void {
    // Sum only the unread counts of UNMUTED instances. Muted instances still
    // show their per-instance badge in the sidebar (so the user sees activity)
    // but don't contribute to the global dock-level total.
    let total = 0;
    for (const [id, n] of this.counts) {
      const instance = this.profiles.getInstance(id);
      if (instance?.muted) continue;
      total += n;
    }
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
      ? this.profiles.getInstance(instanceIdHint)
      : null;
    const activeId = this.profiles.state.activeInstanceId;
    const fallback =
      explicit ??
      (activeId ? this.profiles.getInstance(activeId) : null) ??
      this.profiles.state.instances[0] ??
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
        icon: resolveIconPath(),
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
   *
   * `senderEmail` is optional and currently only supplied by the email
   * overlay pipeline (v2 work). When present and the originating module
   * is an email provider, the title is prefixed with a star marker for
   * VIP senders. Existing callers don't pass it, so the hook is a no-op
   * for chat modules / the test suite.
   */
  private showNative(
    instanceId: string,
    title: string,
    body: string,
    _tag?: string,
    senderEmail?: string,
  ): void {
    this.logger.debug(`native notification from ${instanceId}: ${title} / ${body}`);
    if (this.settings.state.notificationsEnabled === false) {
      this.logger.debug('notifications disabled in settings — suppressing');
      return;
    }
    if (!ElectronNotification.isSupported()) {
      this.logger.warn('native notifications not supported on this platform');
      return;
    }
    const instance = this.profiles.getInstance(instanceId);
    if (!instance) {
      this.logger.warn(`showNative: unknown instance ${instanceId}`);
      return;
    }
    if (instance.muted) {
      this.logger.debug(`instance ${instanceId} is muted — suppressing notification`);
      return;
    }
    if (this.isInDnd()) {
      this.logger.debug('within DND window — suppressing notification');
      return;
    }

    const { title: nTitle, body: nBody } = formatNativeNotification({
      instanceName: instance.name,
      title,
      body,
      privacyMode: this.settings.state.notificationPrivacyMode === true,
    });

    // --- VIP differentiation for email modules ---
    // Only kicks in when the notification carries a sender email AND the
    // originating module has `emailProvider` set on its manifest AND the
    // sender matches a VIP entry. Graceful fall-through on any error so a
    // broken VIP lookup never blocks a real notification.
    let displayTitle = nTitle;
    // overrideSound available for future per-VIP sound support — the
    // existing code only toggles `silent`, so we don't wire sound here.
    let overrideSound: string | undefined = undefined;
    try {
      const container = this.ctx?.container;
      const emailSvc =
        container && container.has('emailOverlay')
          ? container.get<EmailOverlayService>('emailOverlay')
          : null;
      if (emailSvc && senderEmail && this.isEmailModule(instance.moduleId)) {
        const vip = matchVip(emailSvc.listVips(), senderEmail);
        if (vip) {
          displayTitle = `⭐ ${displayTitle}`;
          overrideSound = vip.sound ?? 'glass';
        }
      }
    } catch {
      // Graceful degradation: fall through to standard notification behaviour.
    }
    void overrideSound;

    try {
      const notif = new ElectronNotification({
        title: displayTitle,
        body: nBody,
        icon: resolveIconPath(),
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
          this.profiles.setActive(instanceId);
        } catch (err) {
          this.logger.warn(`notification activate failed for ${instanceId}`, err);
        }
      });
      notif.show();
    } catch (err) {
      this.logger.warn('failed to show native notification', err);
    }
  }

  /**
   * Returns true iff the given moduleId refers to a loaded module whose
   * manifest has `emailProvider` set (i.e. 'gmail' or 'outlook'). Used to
   * gate the VIP title-prefix hook so chat modules are unaffected.
   *
   * Looks up ModuleRegistryService via the container so we don't take a
   * hard dependency on it at init time (tests that don't register the
   * `modules` service still work — the method just returns false).
   */
  private isEmailModule(moduleId: string): boolean {
    try {
      const container = this.ctx?.container;
      if (!container || !container.has('modules')) return false;
      const modules = container.get<ModuleRegistryService>('modules');
      const loaded = modules.get(moduleId);
      return Boolean(loaded?.manifest.emailProvider);
    } catch {
      return false;
    }
  }
}
