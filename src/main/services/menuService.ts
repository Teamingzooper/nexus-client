import {
  app,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from 'electron';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { WindowService } from './windowService';
import type { ViewService } from './viewService';

/**
 * Builds and installs the native application menu. On macOS this is the
 * menu bar at the top of the screen when Nexus is the active app. On
 * Windows/Linux it's the per-window menu (which we hide since Nexus uses
 * an integrated sidebar).
 *
 * The "Settings…" item sends an IPC message to the renderer which opens
 * the settings modal via the existing store action. This keeps one source
 * of truth for the open/close flow regardless of how it was triggered.
 */
export class MenuService implements Service {
  readonly name = 'menu';
  private logger!: Logger;
  private windowService!: WindowService;
  private views!: ViewService;
  private isDev = false;

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('menu');
    this.windowService = ctx.container.get<WindowService>('window');
    this.views = ctx.container.get<ViewService>('views');
    this.isDev = ctx.isDev;
    this.build();
  }

  dispose(): void {
    // On macOS we leave the menu in place until the app quits.
  }

  private sendToRenderer(event: string): void {
    const win = this.windowService.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('nexus:menu', { event });
    }
  }

  private build(): void {
    const isMac = process.platform === 'darwin';

    const template: MenuItemConstructorOptions[] = [
      // Mac app menu (only rendered on darwin).
      ...(isMac
        ? ([
            {
              label: 'Nexus',
              submenu: [
                { role: 'about', label: 'About Nexus' },
                { type: 'separator' },
                {
                  label: 'Settings…',
                  accelerator: 'Cmd+,',
                  click: () => this.sendToRenderer('open-settings'),
                },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide', label: 'Hide Nexus' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit', label: 'Quit Nexus' },
              ],
            },
          ] satisfies MenuItemConstructorOptions[])
        : []),
      {
        label: 'File',
        submenu: [
          {
            label: 'New Instance…',
            accelerator: 'CmdOrCtrl+N',
            click: () => this.sendToRenderer('add-instance'),
          },
          {
            label: 'New Group',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => this.sendToRenderer('add-group'),
          },
          { type: 'separator' },
          ...(isMac
            ? []
            : ([
                {
                  label: 'Settings…',
                  accelerator: 'CmdOrCtrl+,',
                  click: () => this.sendToRenderer('open-settings'),
                },
                { type: 'separator' },
                { role: 'quit' as const },
              ] satisfies MenuItemConstructorOptions[])),
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(isMac
            ? ([
                { role: 'pasteAndMatchStyle' as const },
                { role: 'delete' as const },
                { role: 'selectAll' as const },
              ] satisfies MenuItemConstructorOptions[])
            : ([
                { role: 'delete' as const },
                { type: 'separator' as const },
                { role: 'selectAll' as const },
              ] satisfies MenuItemConstructorOptions[])),
        ],
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Reload Active Instance',
            accelerator: 'CmdOrCtrl+R',
            click: () => {
              try {
                this.views.reloadActive();
              } catch (err) {
                this.logger.warn('menu: reload failed', err);
              }
            },
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(this.isDev
            ? ([
                { type: 'separator' as const },
                { role: 'toggleDevTools' as const },
              ] satisfies MenuItemConstructorOptions[])
            : []),
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac
            ? ([
                { type: 'separator' as const },
                { role: 'front' as const },
                { type: 'separator' as const },
                { role: 'window' as const },
              ] satisfies MenuItemConstructorOptions[])
            : ([{ role: 'close' as const }] satisfies MenuItemConstructorOptions[])),
        ],
      },
      {
        role: 'help',
        submenu: [
          {
            label: 'Nexus on GitHub',
            click: () => {
              shell
                .openExternal('https://github.com/Teamingzooper/nexus-client')
                .catch(() => {});
            },
          },
          {
            label: 'Report an Issue',
            click: () => {
              shell
                .openExternal('https://github.com/Teamingzooper/nexus-client/issues')
                .catch(() => {});
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}
