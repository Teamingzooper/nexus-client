import {
  app,
  Menu,
  MenuItemConstructorOptions,
  Tray,
  globalShortcut,
  nativeImage,
} from 'electron';
import * as path from 'path';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { WindowService } from './windowService';
import type { ProfileService } from './profileService';
import type { SettingsService } from './settingsService';
import type { ViewService } from './viewService';

/**
 * Shared flag between `before-quit` and each window's close intercept.
 * `before-quit` fires before `close` on every window, so we can set this
 * flag there to let the close handlers know the close is a real app quit
 * (don't prevent it) rather than a user clicking the window's ✕ (which
 * we want to swallow and translate into hide-to-tray).
 */
let isQuittingApp = false;
app.on('before-quit', () => {
  isQuittingApp = true;
});

/**
 * System-tray / menu-bar integration.
 *
 * Responsibilities:
 *  - Create a tray icon with a dynamic tooltip showing the total unread count.
 *  - Provide a context menu listing every instance (with its unread count),
 *    a show/hide toggle, new-instance shortcut, settings, and quit.
 *  - Register the user's configured global shortcut (default Alt+`) as a
 *    toggle to summon or hide the window from anywhere.
 *  - Intercept the window's close event when "close to tray" is enabled so
 *    the app keeps running silently in the tray instead of quitting.
 *
 * Reacts to events from NotificationService, ProfileService, and ViewService
 * so the tray menu and tooltip stay in sync with what's visible in the UI.
 */
export class TrayService implements Service {
  readonly name = 'tray';
  private logger!: Logger;
  private ctx!: ServiceContext;
  private tray: Tray | null = null;
  private windowService!: WindowService;
  private settings!: SettingsService;
  private profiles!: ProfileService;
  private views!: ViewService;
  private counts = new Map<string, number>();
  private registeredShortcut: string | null = null;
  private closeIntercept: ((e: Electron.Event) => void) | null = null;
  private unsubscribes: (() => void)[] = [];

  async init(ctx: ServiceContext): Promise<void> {
    this.ctx = ctx;
    this.logger = ctx.logger.child('tray');
    this.windowService = ctx.container.get<WindowService>('window');
    this.settings = ctx.container.get<SettingsService>('settings');
    this.profiles = ctx.container.get<ProfileService>('profiles');
    this.views = ctx.container.get<ViewService>('views');

    this.createTray();
    this.applyGlobalShortcut();
    // applyCloseToTray() needs the main window to exist — bootstrap
    // calls attachWindow() once WindowService.create() has run.

    // Rebuild the menu whenever the data feeding it changes.
    const refresh = () => this.rebuildMenu();
    this.unsubscribes.push(
      ctx.bus.on('notification:update', (u) => {
        this.counts.set(u.moduleId, u.count);
        this.updateTooltip();
        this.rebuildMenu();
      }),
      ctx.bus.on('instance:added', refresh),
      ctx.bus.on('instance:activated', refresh),
      ctx.bus.on('instance:renamed', refresh),
      ctx.bus.on('instance:removed', ({ instanceId }) => {
        this.counts.delete(instanceId);
        refresh();
      }),
    );
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    this.unregisterGlobalShortcut();
    this.removeCloseIntercept();
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }

  /**
   * Called by bootstrap once the main window exists. Everything that needs
   * the BrowserWindow (the close-to-tray intercept) is wired here.
   */
  attachWindow(): void {
    this.applyCloseToTray();
  }

  /**
   * Re-apply the global shortcut registration. Called from IPC when the
   * user toggles the feature or edits the accelerator in Settings.
   */
  refreshGlobalShortcut(): void {
    this.unregisterGlobalShortcut();
    this.applyGlobalShortcut();
  }

  /**
   * Re-apply the close-to-tray behavior. Called from IPC when the user
   * toggles the setting.
   */
  refreshCloseToTray(): void {
    this.removeCloseIntercept();
    this.applyCloseToTray();
  }

  private createTray(): void {
    const iconPath = resolveTrayIconPath();
    let image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      this.logger.warn(`tray icon not found at ${iconPath} — using fallback`);
      image = nativeImage.createEmpty();
    } else if (process.platform === 'darwin') {
      // macOS menu bar icons must be Template images so they adapt to
      // light/dark menu bar colors automatically.
      image = image.resize({ width: 18, height: 18 });
      image.setTemplateImage(true);
    } else {
      image = image.resize({ width: 16, height: 16 });
    }
    this.tray = new Tray(image);
    this.tray.setToolTip('Nexus');
    this.tray.on('click', () => this.toggleWindow());
    this.rebuildMenu();
  }

  private rebuildMenu(): void {
    if (!this.tray || this.tray.isDestroyed()) return;

    const instances = this.profiles.state.instances;
    const instanceItems: MenuItemConstructorOptions[] = instances.map(
      (instance) => {
        const count = this.counts.get(instance.id) ?? 0;
        const label = count > 0 ? `${instance.name} (${count})` : instance.name;
        return {
          label,
          click: () => {
            this.showWindow();
            try {
              this.views.activate(instance.id);
              this.profiles.setActive(instance.id);
            } catch (err) {
              this.logger.warn(
                `tray: failed to activate ${instance.id}`,
                err instanceof Error ? err.message : err,
              );
            }
          },
        };
      },
    );

    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Show Nexus',
        click: () => this.showWindow(),
      },
      { type: 'separator' },
      ...(instanceItems.length > 0
        ? [
            { label: 'Instances', enabled: false } as MenuItemConstructorOptions,
            ...instanceItems,
            { type: 'separator' } as MenuItemConstructorOptions,
          ]
        : []),
      {
        label: 'Settings…',
        click: () => this.sendMenu('open-settings'),
      },
      {
        label: 'New Instance…',
        click: () => this.sendMenu('add-instance'),
      },
      { type: 'separator' },
      {
        label: 'Quit Nexus',
        click: () => {
          // Bypass the close-to-tray intercept: quitting is explicit.
          this.removeCloseIntercept();
          app.quit();
        },
      },
    ];

    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  private updateTooltip(): void {
    if (!this.tray || this.tray.isDestroyed()) return;
    let total = 0;
    for (const [id, n] of this.counts) {
      const instance = this.profiles.getInstance(id);
      if (instance?.muted) continue;
      total += n;
    }
    this.tray.setToolTip(total > 0 ? `Nexus — ${total} unread` : 'Nexus');
  }

  private toggleWindow(): void {
    const win = this.windowService.getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      this.showWindow();
    }
  }

  private showWindow(): void {
    const win = this.windowService.getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }

  private applyGlobalShortcut(): void {
    const { globalShortcutEnabled, globalShortcut: accel } = this.settings.state;
    if (!globalShortcutEnabled || !accel) return;
    try {
      const ok = globalShortcut.register(accel, () => this.toggleWindow());
      if (ok) {
        this.registeredShortcut = accel;
        this.logger.info(`global shortcut registered: ${accel}`);
      } else {
        this.logger.warn(`global shortcut already in use by another app: ${accel}`);
      }
    } catch (err) {
      this.logger.warn(`global shortcut registration failed: ${accel}`, err);
    }
  }

  private unregisterGlobalShortcut(): void {
    if (!this.registeredShortcut) return;
    try {
      globalShortcut.unregister(this.registeredShortcut);
    } catch {
      // ignore
    }
    this.registeredShortcut = null;
  }

  private applyCloseToTray(): void {
    if (!this.settings.state.closeToTray) return;
    const win = this.windowService.getWindow();
    if (!win || win.isDestroyed()) return;
    const handler = (e: Electron.Event) => {
      // The user pressing Cmd+Q / File → Quit fires before-quit first;
      // the flag we set there tells this handler the close is real so
      // we don't swallow a legitimate shutdown. Clicking the red traffic
      // light / window ✕ arrives here without before-quit → hide to tray.
      if (isQuittingApp) return;
      e.preventDefault();
      win.hide();
    };
    win.on('close', handler);
    this.closeIntercept = handler;
  }

  private removeCloseIntercept(): void {
    if (!this.closeIntercept) return;
    const win = this.windowService.getWindow();
    if (win && !win.isDestroyed()) {
      win.removeListener('close', this.closeIntercept);
    }
    this.closeIntercept = null;
  }

  private sendMenu(event: string): void {
    this.showWindow();
    const win = this.windowService.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('nexus:menu', { event });
  }
}

/**
 * Resolve the tray icon path. Looks for a dedicated `trayIconTemplate.png`
 * first (macOS template image), then falls back to the app icon.
 */
function resolveTrayIconPath(): string {
  const resourcesBase = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', '..', '..', '..', 'build');
  return path.join(resourcesBase, 'icon.png');
}
