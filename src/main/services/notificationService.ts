import { app, BrowserWindow } from 'electron';
import { IPC } from '../../shared/types';
import type { UnreadUpdate } from '../../shared/types';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { WindowService } from './windowService';

export class NotificationService implements Service {
  readonly name = 'notifications';
  private logger!: Logger;
  private counts = new Map<string, number>();
  private previews = new Map<string, string>();
  private windowService!: WindowService;
  private unsubscribe: (() => void)[] = [];

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('notifications');
    this.windowService = ctx.container.get<WindowService>('window');

    this.unsubscribe.push(
      ctx.bus.on('notification:update', (u) => this.report(u)),
      ctx.bus.on('instance:removed', ({ instanceId }) => this.clear(instanceId)),
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
}
