import { app } from 'electron';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { WindowService } from './windowService';

export interface UpdateInfo {
  version: string;
  releaseName?: string | null;
  releaseNotes?: string | null;
  releaseDate?: string | null;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | ({ state: 'available' } & UpdateInfo)
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | ({ state: 'downloaded' } & UpdateInfo)
  | { state: 'error'; message: string };

/**
 * electron-updater normalizes releaseNotes into a string when feeding it
 * from a single release, or an array of { version, note } objects when it
 * spans multiple releases. Stringify both shapes into one markdown-ish blob
 * so the renderer can just paste it into a <pre>.
 */
function normalizeReleaseNotes(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    const parts: string[] = [];
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const v = (entry as { version?: unknown }).version;
      const n = (entry as { note?: unknown }).note;
      const header = typeof v === 'string' ? `## ${v}\n\n` : '';
      const body = typeof n === 'string' ? n : '';
      if (header || body) parts.push(`${header}${body}`);
    }
    return parts.length ? parts.join('\n\n---\n\n') : null;
  }
  return null;
}

function pickInfo(info: any): UpdateInfo {
  return {
    version: String(info?.version ?? ''),
    releaseName:
      typeof info?.releaseName === 'string' && info.releaseName.length > 0
        ? info.releaseName
        : null,
    releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    releaseDate:
      typeof info?.releaseDate === 'string' && info.releaseDate.length > 0
        ? info.releaseDate
        : null,
  };
}

/**
 * Wraps electron-updater. Auto-checks on launch in packaged builds,
 * exposes manual check/install via IPC, and broadcasts state transitions
 * to the renderer via the 'nexus:updater:status' IPC event so the
 * UpdateBanner can show progress.
 *
 * Disabled entirely in dev (app.isPackaged === false) — electron-updater
 * needs the latest-mac.yml / latest.yml files in a published GitHub
 * release, which only exist for tagged builds.
 */
export class UpdaterService implements Service {
  readonly name = 'updater';
  private logger!: Logger;
  private windowService!: WindowService;
  private currentStatus: UpdateStatus = { state: 'idle' };
  private autoUpdater: any = null; // typed any so dev doesn't import the dep

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('updater');
    this.windowService = ctx.container.get<WindowService>('window');

    if (!app.isPackaged) {
      this.logger.debug('updater disabled (dev build)');
      return;
    }

    try {
      // Lazy require so the dev path doesn't pull in electron-updater
      // (which fails to initialize without app.isPackaged).
      const mod = require('electron-updater');
      this.autoUpdater = mod.autoUpdater;
    } catch (err) {
      this.logger.warn('electron-updater not available', err);
      return;
    }

    this.autoUpdater.autoDownload = true;
    this.autoUpdater.autoInstallOnAppQuit = true;
    this.autoUpdater.logger = {
      info: (m: string) => this.logger.info(`[updater] ${m}`),
      warn: (m: string) => this.logger.warn(`[updater] ${m}`),
      error: (m: string) => this.logger.error(`[updater] ${m}`),
      debug: (m: string) => this.logger.debug(`[updater] ${m}`),
    };

    this.autoUpdater.on('checking-for-update', () => {
      this.setStatus({ state: 'checking' });
    });
    this.autoUpdater.on('update-available', (info: any) => {
      this.setStatus({ state: 'available', ...pickInfo(info) });
    });
    this.autoUpdater.on('update-not-available', (info: any) => {
      this.setStatus({ state: 'not-available', version: String(info?.version ?? '') });
    });
    this.autoUpdater.on('download-progress', (p: any) => {
      this.setStatus({ state: 'downloading', percent: Math.floor(p.percent) });
    });
    this.autoUpdater.on('update-downloaded', (info: any) => {
      this.setStatus({ state: 'downloaded', ...pickInfo(info) });
    });
    this.autoUpdater.on('error', (err: any) => {
      this.setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });

    // Kick off the check ~5s after launch so it doesn't compete with the
    // first paint.
    setTimeout(() => {
      this.checkForUpdates().catch((err) =>
        this.logger.warn('initial update check failed', err),
      );
    }, 5000);
  }

  status(): UpdateStatus {
    return this.currentStatus;
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.autoUpdater) return this.currentStatus;
    try {
      await this.autoUpdater.checkForUpdates();
    } catch (err) {
      this.setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return this.currentStatus;
  }

  quitAndInstall(): void {
    if (!this.autoUpdater) return;
    try {
      this.autoUpdater.quitAndInstall();
    } catch (err) {
      this.logger.warn('quitAndInstall failed', err);
    }
  }

  private setStatus(s: UpdateStatus): void {
    this.currentStatus = s;
    this.logger.info(`updater state → ${s.state}`);
    const win = this.windowService.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('nexus:updater:status', s);
    }
  }
}
