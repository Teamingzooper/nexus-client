import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { ServiceContainer } from './core/service';
import { rootLogger } from './core/logger';
import { EventBus } from './core/eventBus';
import { SettingsService } from './services/settingsService';
import { ThemeService } from './services/themeService';
import { ModuleRegistryService } from './services/moduleRegistryService';
import { ProfileService } from './services/profileService';
import { WindowService } from './services/windowService';
import { ViewService } from './services/viewService';
import { NotificationService } from './services/notificationService';
import { MenuService } from './services/menuService';
import { UpdaterService } from './services/updaterService';
import { TrayService } from './services/trayService';
import { CommunityModulesService } from './services/communityModulesService';
import { HotkeyRegistryService } from './services/hotkeyRegistryService';
import { EmailOverlayService } from './services/emailOverlayService';
import { PeekCacheService } from './services/peekCacheService';
import { IpcService } from './services/ipcService';
import { DEFAULT_PROFILE_ID } from '../shared/profile';

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
    .register(new ProfileService())
    .register(new WindowService())
    // HotkeyRegistryService must be registered before ViewService — the
    // per-view `before-input-event` handler resolves chords against it.
    .register(new HotkeyRegistryService())
    .register(new ViewService())
    .register(new NotificationService())
    .register(new UpdaterService())
    .register(new TrayService())
    .register(new CommunityModulesService())
    .register(new MenuService())
    // EmailOverlayService and PeekCacheService feed IpcService handlers, so
    // they must be registered before it.
    .register(new EmailOverlayService())
    .register(new PeekCacheService())
    // IpcService must be last — it reads from every other service.
    .register(new IpcService());

  await container.init();

  // --- Nexus Mail bootstrap ---------------------------------------------
  // Wire the persistence adapters for HotkeyRegistryService and
  // EmailOverlayService now that SettingsService has loaded from disk.
  const hotkeys = container.get<HotkeyRegistryService>('hotkeys');
  const settingsForMail = container.get<SettingsService>('settings');
  hotkeys.configure({
    load: () => settingsForMail.state.hotkeys ?? {},
    save: (bindings) => {
      settingsForMail.update({ hotkeys: bindings });
    },
  });

  // Default email hotkey action. Cmd+Shift+C on macOS, Ctrl+Shift+C elsewhere.
  hotkeys.register({
    id: 'email.copyAsJson',
    label: 'Copy focused email as JSON',
    defaultBinding: process.platform === 'darwin' ? 'Cmd+Shift+C' : 'Ctrl+Shift+C',
  });

  const emailSvc = container.get<EmailOverlayService>('emailOverlay');
  emailSvc.configure({
    loadVips: () => settingsForMail.state.email?.vips ?? [],
    saveVips: (vips) => {
      const email = { ...(settingsForMail.state.email ?? {}), vips };
      settingsForMail.update({ email });
    },
    loadPeekConfig: () => settingsForMail.state.email?.peek,
    savePeekConfig: (peek) => {
      const email = { ...(settingsForMail.state.email ?? {}), peek };
      settingsForMail.update({ email });
    },
    writeClipboard: (text) => {
      // Late-require so tests that mock 'electron' in other modules can't
      // accidentally pull clipboard into their module graph here.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { clipboard } = require('electron');
      clipboard.writeText(text);
    },
  });

  // Bridge VIP list changes into the peek cache so `isVip` flags on cached
  // peek items stay in sync whenever the VIP list is edited.
  const peekCache = container.get<PeekCacheService>('peekCache');
  peekCache.updateVipList(emailSvc.listVips());
  emailSvc.onVipListChange((vips) => peekCache.updateVipList(vips));

  const windowService = container.get<WindowService>('window');
  const settings = container.get<SettingsService>('settings');
  const profiles = container.get<ProfileService>('profiles');
  const views = container.get<ViewService>('views');
  const registry = container.get<ModuleRegistryService>('modules');

  // Reconcile the OS-level "launch at login" flag with the persisted setting
  // on every boot. Cheap, and keeps them in sync if the user toggled via
  // System Settings → General → Login Items.
  try {
    if (settings.state.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true });
    }
  } catch (err) {
    rootLogger.warn('setLoginItemSettings at boot failed', err);
  }

  const win = await windowService.create();

  // Wire the tray's close-to-tray intercept now that the window exists.
  container.get<TrayService>('tray').attachWindow();

  // Auto-unlock: if the previously-active profile exists and is password-less,
  // silently unlock it so returning users skip the picker. Otherwise the
  // renderer's AccountManager will handle profile selection / password entry.
  try {
    const savedActive = settings.state.activeProfileId;
    const candidate =
      profiles.list().find((p) => p.id === savedActive) ??
      // Fallback: on first launch after migration, the Default profile
      // exists with no password and no prior activeProfileId — unlock it
      // automatically so nothing changes for single-profile users.
      (profiles.list().length === 1 ? profiles.list()[0] : null) ??
      profiles.list().find((p) => p.id === DEFAULT_PROFILE_ID && !p.hasPassword) ??
      null;
    if (candidate && !candidate.hasPassword) {
      await profiles.unlock(candidate.id);
      settings.setActiveProfileId(candidate.id);
    }
  } catch (err) {
    rootLogger.warn('auto-unlock failed; user will pick via AccountManager', err);
  }

  // Warm up the unlocked profile's instances after the window paints so the
  // first frame isn't delayed. If no profile is unlocked (password-protected
  // startup), the renderer shows the AccountManager and warm-up happens on
  // unlock instead.
  win.once('ready-to-show', () => {
    setImmediate(() => {
      if (profiles.isLocked()) return;
      for (const instance of profiles.state.instances) {
        if (registry.get(instance.moduleId)) {
          try {
            views.ensure(instance.id);
          } catch (err) {
            rootLogger.warn(`failed to warm ${instance.id}`, err);
          }
        }
      }
      const activeId = profiles.state.activeInstanceId;
      if (activeId && profiles.getInstance(activeId)) {
        views.activate(activeId);
      }
    });
  });

  win.on('closed', () => {
    container.dispose().catch((err) => rootLogger.error('dispose failed', err));
  });

  // Closing the Nexus window quits the whole app on every platform. This
  // overrides the macOS "keep running in dock after window close" convention
  // by design — users asked for it because Nexus is a single-window app and
  // a hidden background process is confusing.
  app.on('window-all-closed', () => {
    app.quit();
  });
}

bootstrap().catch((err) => {
  rootLogger.error('fatal bootstrap error', err);
  app.exit(1);
});
