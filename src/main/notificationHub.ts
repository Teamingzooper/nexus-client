import { BrowserWindow, app } from 'electron';
import { IPC } from '../shared/types';
import type { UnreadUpdate } from '../shared/types';

export class NotificationHub {
  private counts = new Map<string, number>();

  constructor(private win: BrowserWindow) {}

  report(update: UnreadUpdate): void {
    const prev = this.counts.get(update.moduleId) ?? 0;
    if (prev === update.count) {
      this.win.webContents.send(IPC.UNREAD_UPDATE, update);
      return;
    }
    this.counts.set(update.moduleId, update.count);
    this.win.webContents.send(IPC.UNREAD_UPDATE, update);
    this.updateBadge();
  }

  clear(moduleId: string): void {
    this.counts.delete(moduleId);
    this.win.webContents.send(IPC.UNREAD_UPDATE, { moduleId, count: 0 });
    this.updateBadge();
  }

  all(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  private updateBadge(): void {
    const total = [...this.counts.values()].reduce((s, n) => s + n, 0);
    if (process.platform === 'darwin') {
      app.dock?.setBadge(total > 0 ? String(total) : '');
    } else if (process.platform === 'win32') {
      this.win.setOverlayIcon(null, total > 0 ? `${total} unread` : '');
    }
  }
}
