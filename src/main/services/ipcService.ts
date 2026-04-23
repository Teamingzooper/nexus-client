import { z } from 'zod';
import { app, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import { IPC } from '../../shared/types';
import {
  boundsSchema,
  moduleIdSchema,
  themeIdSchema,
  themeSchema,
} from '../../shared/schemas';
import { sidebarLayoutSchema } from '../../shared/sidebarLayout';
import { instanceIdSchema } from '../../shared/instance';
import { profileIdSchema } from '../../shared/profile';
import type { WindowService } from './windowService';
import type { Service, ServiceContext } from '../core/service';
import { IpcRouter } from '../core/ipcRouter';
import type { Logger } from '../core/logger';
import type { SettingsService } from './settingsService';
import type { ThemeService } from './themeService';
import type { ModuleRegistryService } from './moduleRegistryService';
import type { ProfileService } from './profileService';
import type { ViewService } from './viewService';
import type { NotificationService } from './notificationService';
import type { UpdaterService } from './updaterService';
import type { TrayService } from './trayService';
import type { CommunityModulesService } from './communityModulesService';
import type { UserscriptService } from './userscriptService';
import {
  userscriptFilenameSchema,
  userscriptSaveSchema,
  userscriptSetEnabledSchema,
  userscriptRenameSchema,
} from '../../shared/userscripts';

export class IpcService implements Service {
  readonly name = 'ipc';
  private router!: IpcRouter;
  private logger!: Logger;

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('ipc');
    this.router = new IpcRouter(this.logger);

    const settings = ctx.container.get<SettingsService>('settings');
    const themes = ctx.container.get<ThemeService>('themes');
    const registry = ctx.container.get<ModuleRegistryService>('modules');
    const profiles = ctx.container.get<ProfileService>('profiles');
    const views = ctx.container.get<ViewService>('views');
    const notifications = ctx.container.get<NotificationService>('notifications');
    const windowSvc = ctx.container.get<WindowService>('window');
    const updater = ctx.container.get<UpdaterService>('updater');
    const tray = ctx.container.get<TrayService>('tray');
    const community = ctx.container.get<CommunityModulesService>('community-modules');
    const userscripts = ctx.container.get<UserscriptService>('userscripts');

    // Broadcast userscripts changes to the renderer so the settings pane
    // refreshes when the on-disk folder changes (external edits, etc.).
    ctx.bus.on('userscripts:changed', () => {
      const win = windowSvc.getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.USERSCRIPTS_CHANGED, userscripts.list());
      }
    });

    this.router.register(IPC.MODULES_LIST, { handler: () => registry.list() });

    this.router.register(IPC.MODULES_RELOAD, { handler: () => registry.reload() });

    this.router.register(IPC.MODULES_OPEN_DIR, { handler: () => registry.openUserDir() });

    this.router.register(IPC.INSTANCES_ADD, {
      input: moduleIdSchema,
      handler: async (moduleId) => {
        if (profiles.isLocked()) throw new Error('no profile unlocked');
        const mod = registry.get(moduleId);
        if (!mod) throw new Error(`unknown module: ${moduleId}`);
        const instance = profiles.addInstance(moduleId, mod.manifest.name);
        // Paranoid fresh slate: if this partition name was reused after a
        // previous delete, make sure we don't inherit any stale data.
        await views.clearInstanceData(instance.id);
        ctx.bus.emit('instance:added', { instanceId: instance.id, moduleId });
        return instance;
      },
    });

    this.router.register(IPC.INSTANCES_REMOVE, {
      input: instanceIdSchema,
      handler: async (instanceId) => {
        if (profiles.isLocked()) throw new Error('no profile unlocked');
        views.destroy(instanceId);
        await views.clearInstanceData(instanceId);
        profiles.removeInstance(instanceId);
        ctx.bus.emit('instance:removed', { instanceId });
      },
    });

    this.router.register(IPC.INSTANCES_RENAME, {
      input: z.object({ id: instanceIdSchema, name: z.string().min(1).max(96) }),
      handler: ({ id, name }) => {
        if (profiles.isLocked()) throw new Error('no profile unlocked');
        if (!profiles.getInstance(id)) throw new Error(`unknown instance: ${id}`);
        profiles.renameInstance(id, name);
        ctx.bus.emit('instance:renamed', { instanceId: id, name });
      },
    });

    this.router.register(IPC.INSTANCES_ACTIVATE, {
      input: instanceIdSchema,
      handler: (instanceId) => {
        if (profiles.isLocked()) throw new Error('no profile unlocked');
        if (!profiles.getInstance(instanceId)) {
          throw new Error(`unknown instance: ${instanceId}`);
        }
        views.activate(instanceId);
        profiles.setActive(instanceId);
      },
    });

    this.router.register(IPC.INSTANCES_RELOAD_ACTIVE, {
      handler: () => views.reloadActive(),
    });

    this.router.register(IPC.INSTANCES_SET_MUTED, {
      input: z.object({ id: instanceIdSchema, muted: z.boolean() }),
      handler: ({ id, muted }) => {
        if (profiles.isLocked()) throw new Error('no profile unlocked');
        if (!profiles.getInstance(id)) throw new Error(`unknown instance: ${id}`);
        profiles.setInstanceMuted(id, muted);
        // The instance's contribution to the dock badge total just changed.
        notifications.recomputeBadge();
      },
    });

    this.router.register(IPC.THEMES_LIST, { handler: () => themes.list() });

    this.router.register(IPC.THEMES_SET, {
      input: themeIdSchema,
      handler: (id) => {
        if (!themes.get(id)) throw new Error(`unknown theme: ${id}`);
        // When a profile is unlocked the theme is per-profile; the global
        // settings.themeId stays as the locked-state fallback.
        if (!profiles.isLocked()) {
          profiles.setProfileTheme(id);
        } else {
          settings.setTheme(id);
        }
        ctx.bus.emit('theme:changed', { themeId: id });
      },
    });

    this.router.register(IPC.THEMES_SAVE, {
      input: themeSchema,
      handler: async (theme) => themes.save(theme),
    });

    this.router.register(IPC.THEMES_DELETE, {
      input: themeIdSchema,
      handler: async (id) => themes.delete(id),
    });

    this.router.register(IPC.THEMES_EXPORT_PACK, {
      input: z
        .object({
          ids: z.array(themeIdSchema).min(1),
          name: z.string().max(128).optional(),
          author: z.string().max(128).optional(),
        })
        .strict(),
      handler: async ({ ids, name, author }) => {
        const pack = themes.buildPack(ids, { name, author });
        const win = windowSvc.getWindow();
        const parent = win && !win.isDestroyed() ? win : (BrowserWindow.getFocusedWindow() ?? undefined);
        const result = await dialog.showSaveDialog(parent as BrowserWindow, {
          title: 'Export theme pack',
          defaultPath: `${(name ?? pack.themes[0].name).toLowerCase().replace(/\s+/g, '-')}.nexustheme.json`,
          filters: [{ name: 'Nexus theme pack', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) {
          return { canceled: true as const };
        }
        await fs.writeFile(result.filePath, JSON.stringify(pack, null, 2), 'utf8');
        return { canceled: false as const, path: result.filePath, count: pack.themes.length };
      },
    });

    this.router.register(IPC.THEMES_IMPORT_PACK, {
      handler: async () => {
        const win = windowSvc.getWindow();
        const parent = win && !win.isDestroyed() ? win : (BrowserWindow.getFocusedWindow() ?? undefined);
        const result = await dialog.showOpenDialog(parent as BrowserWindow, {
          title: 'Import theme pack',
          properties: ['openFile'],
          filters: [{ name: 'Nexus theme pack', extensions: ['json'] }],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true as const };
        }
        const filePath = result.filePaths[0];
        const raw = await fs.readFile(filePath, 'utf8');
        const added = await themes.importPack(raw);
        return {
          canceled: false as const,
          added,
          themes: themes.list(),
        };
      },
    });

    this.router.register(IPC.STATE_GET, { handler: () => settings.state });

    this.router.register(IPC.LAYOUT_SET_BOUNDS, {
      input: boundsSchema,
      handler: (bounds) => views.setBounds(bounds),
    });

    this.router.register(IPC.LAYOUT_SUSPEND, {
      input: z.boolean(),
      handler: (suspended) => views.setSuspended(suspended),
    });

    this.router.register(IPC.UNREAD_ALL, { handler: () => notifications.all() });

    this.router.register(IPC.NOTIFY_SET_ENABLED, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setNotificationsEnabled(enabled);
      },
    });

    this.router.register(IPC.NOTIFY_TEST, {
      input: z.string().nullable().optional(),
      handler: (instanceId) => notifications.testNotification(instanceId ?? null),
    });

    this.router.register(IPC.NOTIFY_SET_SOUND, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setNotificationSound(enabled);
      },
    });

    this.router.register(IPC.NOTIFY_SET_PRIVACY, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setNotificationPrivacyMode(enabled);
      },
    });

    this.router.register(IPC.NOTIFY_SET_DND, {
      input: z.object({
        enabled: z.boolean(),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
      handler: ({ enabled, start, end }) => {
        settings.setDnd(enabled, start, end);
      },
    });

    this.router.register(IPC.PREFS_SET_LAUNCH_AT_LOGIN, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setLaunchAtLogin(enabled);
        // app.setLoginItemSettings only has real effect in packaged builds.
        // In dev it's a no-op, which is fine — we still persist the setting.
        try {
          app.setLoginItemSettings({ openAtLogin: enabled });
        } catch (err) {
          this.logger.warn('setLoginItemSettings failed', err);
        }
      },
    });

    this.router.register(IPC.PREFS_SET_SIDEBAR_COMPACT, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setSidebarCompact(enabled);
      },
    });

    this.router.register(IPC.PREFS_SET_SIDEBAR_WIDTH, {
      input: z.number().int().min(68).max(600),
      handler: (width) => {
        settings.setSidebarWidth(width);
      },
    });

    this.router.register(IPC.PREFS_SET_CLOSE_TO_TRAY, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setCloseToTray(enabled);
        tray.refreshCloseToTray();
      },
    });

    this.router.register(IPC.PREFS_SET_GLOBAL_SHORTCUT_ENABLED, {
      input: z.boolean(),
      handler: (enabled) => {
        settings.setGlobalShortcutEnabled(enabled);
        tray.refreshGlobalShortcut();
      },
    });

    this.router.register(IPC.PREFS_SET_GLOBAL_SHORTCUT, {
      input: z.string().min(1).max(64),
      handler: (accel) => {
        settings.setGlobalShortcut(accel);
        tray.refreshGlobalShortcut();
      },
    });

    this.router.register(IPC.SIDEBAR_UPDATE_LAYOUT, {
      input: sidebarLayoutSchema,
      handler: (layout) => {
        if (profiles.isLocked()) throw new Error('no profile unlocked');
        profiles.setSidebarLayout(layout);
        return profiles.state.sidebarLayout;
      },
    });

    this.router.register(IPC.APP_CLEAR_ALL_DATA, {
      handler: async () => {
        // Snapshot instance ids from the currently-unlocked profile so
        // ViewService can clear those partitions. Non-unlocked profiles
        // still have their state files deleted below.
        const instanceIds = profiles.state.instances.map((i) => i.id);
        await views.clearAllData(instanceIds);
        await themes.clearAll();
        await settings.clearAll();
        const win = windowSvc.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.reloadIgnoringCache();
        }
      },
    });

    // ─────────────────────────────────────────────────────── profiles ──

    this.router.register(IPC.PROFILES_LIST, {
      handler: () => profiles.list(),
    });

    this.router.register(IPC.PROFILES_CURRENT, {
      handler: () => profiles.current(),
    });

    this.router.register(IPC.PROFILES_STATE, {
      handler: () => ({
        current: profiles.current(),
        state: profiles.isLocked() ? null : profiles.state,
      }),
    });

    this.router.register(IPC.PROFILES_CREATE, {
      input: z.object({
        name: z.string().min(1).max(64),
        password: z.string().max(256).optional(),
      }),
      handler: async (input) => profiles.createProfile(input),
    });

    this.router.register(IPC.PROFILES_UNLOCK, {
      input: z.object({
        id: profileIdSchema,
        password: z.string().max(256).optional(),
      }),
      handler: async ({ id, password }) => {
        // Lock current views before switching — they belong to the outgoing
        // profile's partitions and state.
        views.destroyAll();
        // Drop unread counts from the outgoing profile so they don't bleed
        // into the new profile's dock badge total.
        notifications.resetCounts();
        await profiles.unlock(id, password);
        settings.setActiveProfileId(id);
        // Warm up the newly-unlocked profile's instances so the sidebar
        // feels instant.
        for (const instance of profiles.state.instances) {
          if (registry.get(instance.moduleId)) {
            try {
              views.ensure(instance.id);
            } catch (err) {
              this.logger.warn(`warm ${instance.id} after unlock failed`, err);
            }
          }
        }
        const activeId = profiles.state.activeInstanceId;
        if (activeId && profiles.getInstance(activeId)) {
          views.activate(activeId);
        }
        return profiles.current();
      },
    });

    this.router.register(IPC.PROFILES_LOCK, {
      handler: () => {
        views.destroyAll();
        notifications.resetCounts();
        profiles.lock();
        settings.setActiveProfileId(null);
      },
    });

    this.router.register(IPC.PROFILES_DELETE, {
      input: profileIdSchema,
      handler: async (id) => {
        // If we're deleting the currently unlocked profile, destroy its
        // views first so open WebContentsViews don't keep writing to
        // partitions we're about to wipe.
        if (profiles.activeProfileId() === id) {
          views.destroyAll();
          notifications.resetCounts();
          settings.setActiveProfileId(null);
        }
        await profiles.deleteProfile(id);
      },
    });

    this.router.register(IPC.PROFILES_RENAME, {
      input: z.object({ id: profileIdSchema, name: z.string().min(1).max(64) }),
      handler: ({ id, name }) => {
        profiles.renameProfile(id, name);
      },
    });

    this.router.register(IPC.PROFILES_CHANGE_PASSWORD, {
      input: z.object({
        id: profileIdSchema,
        oldPassword: z.string().max(256).nullable(),
        newPassword: z.string().max(256).nullable(),
      }),
      handler: async ({ id, oldPassword, newPassword }) =>
        profiles.changePassword(id, oldPassword, newPassword),
    });

    this.router.register(IPC.UPDATER_CHECK, {
      handler: async () => updater.checkForUpdates(),
    });

    this.router.register(IPC.UPDATER_DOWNLOAD, {
      handler: async () => updater.downloadUpdate(),
    });

    this.router.register(IPC.UPDATER_INSTALL, {
      handler: () => {
        updater.quitAndInstall();
      },
    });

    this.router.register(IPC.UPDATER_STATUS, {
      handler: () => updater.status(),
    });

    this.router.register(IPC.APP_VERSION, {
      handler: () => ({
        version: app.getVersion(),
        isPackaged: app.isPackaged,
      }),
    });

    this.router.register(IPC.COMMUNITY_MODULES_LIST, {
      handler: () => community.list(),
    });

    this.router.register(IPC.COMMUNITY_MODULES_INSTALL, {
      input: z.object({
        moduleId: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9][a-z0-9-_]*$/),
        overwrite: z.boolean().optional(),
      }),
      handler: async ({ moduleId, overwrite }) => {
        await community.install(moduleId, overwrite === true);
      },
    });

    this.router.register(IPC.USERSCRIPTS_LIST, { handler: () => userscripts.list() });

    this.router.register(IPC.USERSCRIPTS_GET, {
      input: userscriptFilenameSchema,
      handler: (filename) => {
        const s = userscripts.get(filename);
        if (!s) throw new Error(`unknown userscript: ${filename}`);
        return s;
      },
    });

    this.router.register(IPC.USERSCRIPTS_SAVE, {
      input: userscriptSaveSchema,
      handler: async ({ filename, source }) => userscripts.save(filename, source),
    });

    this.router.register(IPC.USERSCRIPTS_DELETE, {
      input: userscriptFilenameSchema,
      handler: async (filename) => userscripts.delete(filename),
    });

    this.router.register(IPC.USERSCRIPTS_SET_ENABLED, {
      input: userscriptSetEnabledSchema,
      handler: async ({ filename, enabled }) => userscripts.setEnabled(filename, enabled),
    });

    this.router.register(IPC.USERSCRIPTS_RENAME, {
      input: userscriptRenameSchema,
      handler: async ({ from, to }) => userscripts.rename(from, to),
    });

    this.router.register(IPC.USERSCRIPTS_DUPLICATE, {
      input: userscriptFilenameSchema,
      handler: async (filename) => userscripts.duplicate(filename),
    });

    this.router.register(IPC.USERSCRIPTS_OPEN_DIR, {
      handler: () => userscripts.openDir(),
    });

    this.router.register(IPC.USERSCRIPTS_RESCAN, {
      handler: () => userscripts.scan(),
    });
  }

  dispose(): void {
    this.router.dispose();
  }
}
