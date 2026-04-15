import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { ServiceContainer } from './core/service';
import { rootLogger } from './core/logger';
import { EventBus } from './core/eventBus';
import { SettingsService } from './services/settingsService';
import { ThemeService } from './services/themeService';
import { ModuleRegistryService } from './services/moduleRegistryService';
import { WindowService } from './services/windowService';
import { ViewService } from './services/viewService';
import { NotificationService } from './services/notificationService';
import { MenuService } from './services/menuService';
import { IpcService } from './services/ipcService';

const isDev = process.env.NEXUS_DEV === '1';

// Brand the app as "Nexus" before any Electron init. On macOS the menu bar
// name is derived from Info.plist when running a packaged .app, but for the
// bare `electron .` dev flow app.setName still takes effect for dialogs and
// the dock label on some platforms. Must run before app.whenReady().
app.setName('Nexus');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.teamingzooper.nexus');
}
app.setAboutPanelOptions({
  applicationName: 'Nexus',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: 'Copyright © 2026 Teamingzooper',
  website: 'https://github.com/Teamingzooper/nexus-client',
});

// E2E / test isolation: each test run can point us at a throwaway userData dir.
if (process.env.NEXUS_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.NEXUS_USER_DATA));
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const bus = new EventBus();
  // appRoot must point at the directory whose `modules/` subfolder holds the
  // bundled modules. In a packaged build electron-builder copies `modules/`
  // into `process.resourcesPath` via the `extraResources` config. In dev,
  // index.js is at dist/main/main/index.js so three `..` get us to the repo root.
  const appRoot = app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, '..', '..', '..');

  const container = new ServiceContainer({
    logger: rootLogger,
    bus,
    userData: app.getPath('userData'),
    appPath: appRoot,
    isDev,
  });

  container
    .register(new SettingsService())
    .register(new ThemeService())
    .register(new ModuleRegistryService())
    .register(new WindowService())
    .register(new ViewService())
    .register(new NotificationService())
    .register(new MenuService())
    .register(new IpcService());

  await container.init();

  const windowService = container.get<WindowService>('window');
  const win = await windowService.create();

  const settings = container.get<SettingsService>('settings');
  const views = container.get<ViewService>('views');
  const registry = container.get<ModuleRegistryService>('modules');

  // Warm up existing instances after the window paints so the first frame isn't delayed.
  win.once('ready-to-show', () => {
    setImmediate(() => {
      for (const instance of settings.state.instances) {
        if (registry.get(instance.moduleId)) {
          try {
            views.ensure(instance.id);
          } catch (err) {
            rootLogger.warn(`failed to warm ${instance.id}`, err);
          }
        }
      }
      const activeId = settings.state.activeInstanceId;
      if (activeId && settings.getInstance(activeId)) {
        views.activate(activeId);
      }
    });
  });

  win.on('closed', () => {
    container.dispose().catch((err) => rootLogger.error('dispose failed', err));
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await windowService.create();
    }
  });
}

bootstrap().catch((err) => {
  rootLogger.error('fatal bootstrap error', err);
  app.exit(1);
});
