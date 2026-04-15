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
import { IpcService } from './services/ipcService';

const isDev = process.env.NEXUS_DEV === '1';

// E2E / test isolation: each test run can point us at a throwaway userData dir.
if (process.env.NEXUS_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.NEXUS_USER_DATA));
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const bus = new EventBus();
  // appRoot must point at the repo/app root (where `modules/` lives).
  // In dev/launch, index.js is at dist/main/main/index.js, so three `..` get us to the root.
  // In a future packaged build, electron-builder should place modules/ next to resources/.
  const appRoot = path.resolve(__dirname, '..', '..', '..');

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
    .register(new IpcService());

  await container.init();

  const windowService = container.get<WindowService>('window');
  const win = await windowService.create();

  const settings = container.get<SettingsService>('settings');
  const views = container.get<ViewService>('views');
  const registry = container.get<ModuleRegistryService>('modules');

  // Warm up enabled modules after the window paints so the first frame isn't delayed.
  win.once('ready-to-show', () => {
    setImmediate(() => {
      for (const id of settings.state.enabledModuleIds) {
        if (registry.get(id)) {
          try {
            views.ensure(id);
          } catch (err) {
            rootLogger.warn(`failed to warm ${id}`, err);
          }
        }
      }
      if (settings.state.activeModuleId && registry.get(settings.state.activeModuleId)) {
        views.activate(settings.state.activeModuleId);
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
