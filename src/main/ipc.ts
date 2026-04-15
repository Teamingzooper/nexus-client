import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/types';
import type { Theme } from '../shared/types';
import type { SettingsStore } from './settingsStore';
import type { ThemeStore } from './themeStore';
import type { ModuleRegistry } from './moduleRegistry';
import type { ViewManager } from './viewManager';
import type { NotificationHub } from './notificationHub';

interface Deps {
  settings: SettingsStore;
  themes: ThemeStore;
  registry: ModuleRegistry;
  views: ViewManager;
  notifications: NotificationHub;
  win: BrowserWindow;
}

export function registerIpc(deps: Deps): void {
  const { settings, themes, registry, views, notifications } = deps;

  ipcMain.handle(IPC.MODULES_LIST, () => registry.list());

  ipcMain.handle(IPC.MODULES_RELOAD, async () => {
    await registry.load();
    return registry.list();
  });

  ipcMain.handle(IPC.MODULES_ACTIVATE, async (_e, id: string) => {
    if (!settings.state.enabledModuleIds.includes(id)) {
      await settings.enableModule(id);
    }
    views.activate(id);
    await settings.update({ activeModuleId: id });
  });

  ipcMain.handle(IPC.MODULES_ENABLE, async (_e, id: string) => {
    if (!registry.get(id)) throw new Error(`unknown module: ${id}`);
    views.ensureView(id);
    await settings.enableModule(id);
  });

  ipcMain.handle(IPC.MODULES_DISABLE, async (_e, id: string) => {
    views.disable(id);
    notifications.clear(id);
    await settings.disableModule(id);
  });

  ipcMain.handle(IPC.MODULES_OPEN_DIR, () => registry.openUserDir());

  ipcMain.handle(IPC.THEMES_LIST, () => themes.list());

  ipcMain.handle(IPC.THEMES_SET, async (_e, id: string) => {
    const theme = themes.get(id);
    if (!theme) throw new Error(`unknown theme: ${id}`);
    await settings.update({ themeId: id });
  });

  ipcMain.handle(IPC.THEMES_SAVE, async (_e, theme: Theme) => themes.save(theme));

  ipcMain.handle(IPC.STATE_GET, () => settings.state);

  ipcMain.handle(
    IPC.LAYOUT_SET_BOUNDS,
    (_e, bounds: { x: number; y: number; width: number; height: number }) => {
      views.setBounds(bounds);
    },
  );

  ipcMain.handle(IPC.LAYOUT_SUSPEND, (_e, suspended: boolean) => {
    views.setSuspended(!!suspended);
  });

  ipcMain.handle(IPC.UNREAD_ALL, () => notifications.all());
}
