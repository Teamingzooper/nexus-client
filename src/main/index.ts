import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { ModuleRegistry } from './moduleRegistry';
import { ViewManager } from './viewManager';
import { SettingsStore } from './settingsStore';
import { ThemeStore } from './themeStore';
import { NotificationHub } from './notificationHub';
import { registerIpc } from './ipc';

const isDev = process.env.NEXUS_DEV === '1';

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#16161e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await win.loadURL('http://localhost:5173');
  } else {
    await win.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const settings = new SettingsStore();
  await settings.load();

  const themes = new ThemeStore();
  await themes.load();

  const registry = new ModuleRegistry();
  await registry.load();

  const win = await createWindow();
  const views = new ViewManager(win, registry);
  const notifications = new NotificationHub(win);

  views.on('unread', (update) => notifications.report(update));

  for (const id of settings.state.enabledModuleIds) {
    try {
      views.ensureView(id);
    } catch (err) {
      console.error(`[nexus] failed to init module ${id}:`, err);
    }
  }

  if (settings.state.activeModuleId) {
    views.activate(settings.state.activeModuleId);
  }

  registerIpc({ settings, themes, registry, views, notifications, win });

  win.on('closed', () => {
    views.destroyAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap().catch((err) => console.error('[nexus] re-bootstrap failed:', err));
    }
  });
}

bootstrap().catch((err) => {
  console.error('[nexus] fatal bootstrap error:', err);
  app.exit(1);
});
