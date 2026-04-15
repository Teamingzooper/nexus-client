import * as fs from 'fs/promises';
import * as path from 'path';
import { appStateSchema } from '../../shared/schemas';
import type { AppState } from '../../shared/types';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';

/**
 * Global app-wide settings: themes, window state, notification prefs,
 * launch-at-login, compact sidebar, and the currently-active profile id.
 *
 * Per-profile data (instances, sidebar layout, active instance) lives in
 * ProfileService — instances go with whichever profile owns them, not
 * with the app as a whole.
 */
const DEFAULT_STATE: AppState = {
  themeId: 'nexus-dark',
  activeProfileId: null,
  notificationsEnabled: true,
  notificationSound: true,
  launchAtLogin: false,
  sidebarCompact: false,
  windowState: { width: 1280, height: 820 },
};

export class SettingsService implements Service {
  readonly name = 'settings';
  private logger!: Logger;
  private file = '';
  private _state: AppState = { ...DEFAULT_STATE };
  private writeQueue: Promise<void> = Promise.resolve();

  get state(): AppState {
    return this._state;
  }

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('settings');
    // New filename so the pre-profiles nexus-state.json can be migrated by
    // ProfileService without being overwritten by this service.
    this.file = path.join(ctx.userData, 'nexus-app-state.json');
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await this.load();
  }

  async dispose(): Promise<void> {
    await this.writeQueue;
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = appStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this._state = { ...DEFAULT_STATE, ...parsed.data };
      } else {
        this.logger.warn(
          'app-state validation failed, reverting to defaults',
          parsed.error.flatten(),
        );
        this._state = { ...DEFAULT_STATE };
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.warn('app-state load error', err);
      this._state = { ...DEFAULT_STATE };
    }
  }

  private queueWrite(): void {
    const snapshot = this._state;
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const tmp = `${this.file}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await fs.rename(tmp, this.file);
      } catch (err) {
        this.logger.error('app-state write failed', err);
      }
    });
  }

  update(patch: Partial<AppState>): void {
    this._state = { ...this._state, ...patch };
    this.queueWrite();
  }

  setActiveProfileId(id: string | null): void {
    if (this._state.activeProfileId === id) return;
    this._state = { ...this._state, activeProfileId: id };
    this.queueWrite();
  }

  setTheme(id: string): void {
    if (this._state.themeId === id) return;
    this._state = { ...this._state, themeId: id };
    this.queueWrite();
  }

  setNotificationsEnabled(enabled: boolean): void {
    if (this._state.notificationsEnabled === enabled) return;
    this._state = { ...this._state, notificationsEnabled: enabled };
    this.queueWrite();
  }

  setNotificationSound(enabled: boolean): void {
    if (this._state.notificationSound === enabled) return;
    this._state = { ...this._state, notificationSound: enabled };
    this.queueWrite();
  }

  setLaunchAtLogin(enabled: boolean): void {
    if (this._state.launchAtLogin === enabled) return;
    this._state = { ...this._state, launchAtLogin: enabled };
    this.queueWrite();
  }

  setSidebarCompact(enabled: boolean): void {
    if (this._state.sidebarCompact === enabled) return;
    this._state = { ...this._state, sidebarCompact: enabled };
    this.queueWrite();
  }

  setWindowState(ws: AppState['windowState']): void {
    this._state = { ...this._state, windowState: ws };
    this.queueWrite();
  }

  /** Reset global settings to defaults. Profile data is wiped separately. */
  async clearAll(): Promise<void> {
    this._state = { ...DEFAULT_STATE };
    try {
      await fs.rm(this.file, { force: true });
    } catch (err) {
      this.logger.warn('could not remove app-state file', err);
    }
  }
}
