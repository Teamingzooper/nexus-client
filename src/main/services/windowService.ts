import { BrowserWindow, shell } from 'electron';
import * as path from 'path';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { SettingsService } from './settingsService';
import { applyRendererCsp } from '../core/security';

export class WindowService implements Service {
  readonly name = 'window';
  private logger!: Logger;
  private win: BrowserWindow | null = null;
  private ctx!: ServiceContext;

  async init(ctx: ServiceContext): Promise<void> {
    this.ctx = ctx;
    this.logger = ctx.logger.child('window');
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }

  getWindow(): BrowserWindow | null {
    return this.win;
  }

  async create(): Promise<BrowserWindow> {
    const settings = this.ctx.container.get<SettingsService>('settings');
    const ws = settings.state.windowState ?? { width: 1280, height: 820 };

    const win = new BrowserWindow({
      width: ws.width,
      height: ws.height,
      x: ws.x,
      y: ws.y,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: '#16161e',
      show: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        webviewTag: false,
        devTools: this.ctx.isDev,
      },
    });

    applyRendererCsp(win.webContents.session);

    if (ws.maximized) win.maximize();

    win.once('ready-to-show', () => win.show());

    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, target) => {
      // Renderer should never navigate — block everything.
      if (!target.startsWith('http://localhost:5173') && !target.startsWith('file://')) {
        event.preventDefault();
      }
    });

    const saveWindowState = () => {
      if (win.isDestroyed()) return;
      const b = win.getNormalBounds();
      settings.setWindowState({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        maximized: win.isMaximized(),
      });
    };
    win.on('resize', debounce(saveWindowState, 500));
    win.on('move', debounce(saveWindowState, 500));
    win.on('maximize', saveWindowState);
    win.on('unmaximize', saveWindowState);
    win.on('close', saveWindowState);

    if (this.ctx.isDev) {
      await win.loadURL('http://localhost:5173');
    } else {
      // From dist/main/main/services/ up to dist/, then into renderer/.
      await win.loadFile(path.join(__dirname, '..', '..', '..', 'renderer', 'index.html'));
    }

    this.win = win;
    return win;
  }
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: NodeJS.Timeout | undefined;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
