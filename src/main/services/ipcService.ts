import { z } from 'zod';
import { dialog, BrowserWindow } from 'electron';
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
import type { WindowService } from './windowService';
import type { Service, ServiceContext } from '../core/service';
import { IpcRouter } from '../core/ipcRouter';
import type { Logger } from '../core/logger';
import type { SettingsService } from './settingsService';
import type { ThemeService } from './themeService';
import type { ModuleRegistryService } from './moduleRegistryService';
import type { ViewService } from './viewService';
import type { NotificationService } from './notificationService';

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
    const views = ctx.container.get<ViewService>('views');
    const notifications = ctx.container.get<NotificationService>('notifications');
    const windowSvc = ctx.container.get<WindowService>('window');

    this.router.register(IPC.MODULES_LIST, { handler: () => registry.list() });

    this.router.register(IPC.MODULES_RELOAD, { handler: () => registry.reload() });

    this.router.register(IPC.MODULES_OPEN_DIR, { handler: () => registry.openUserDir() });

    this.router.register(IPC.INSTANCES_ADD, {
      input: moduleIdSchema,
      handler: async (moduleId) => {
        const mod = registry.get(moduleId);
        if (!mod) throw new Error(`unknown module: ${moduleId}`);
        const instance = settings.addInstance(moduleId, mod.manifest.name);
        // Paranoid fresh slate: if this instance id was reused after a previous
        // delete, make sure we don't inherit any stale partition data.
        await views.clearInstanceData(instance.id);
        ctx.bus.emit('instance:added', { instanceId: instance.id, moduleId });
        return instance;
      },
    });

    this.router.register(IPC.INSTANCES_REMOVE, {
      input: instanceIdSchema,
      handler: async (instanceId) => {
        // 1. Tear down the view so nothing is writing to the partition.
        views.destroy(instanceId);
        // 2. Purge persisted data (cookies, localStorage, IndexedDB, cache, ...).
        await views.clearInstanceData(instanceId);
        // 3. Drop the instance from settings.
        settings.removeInstance(instanceId);
        ctx.bus.emit('instance:removed', { instanceId });
      },
    });

    this.router.register(IPC.INSTANCES_RENAME, {
      input: z.object({ id: instanceIdSchema, name: z.string().min(1).max(96) }),
      handler: ({ id, name }) => {
        if (!settings.getInstance(id)) throw new Error(`unknown instance: ${id}`);
        settings.renameInstance(id, name);
        ctx.bus.emit('instance:renamed', { instanceId: id, name });
      },
    });

    this.router.register(IPC.INSTANCES_ACTIVATE, {
      input: instanceIdSchema,
      handler: (instanceId) => {
        if (!settings.getInstance(instanceId)) {
          throw new Error(`unknown instance: ${instanceId}`);
        }
        views.activate(instanceId);
        settings.setActive(instanceId);
      },
    });

    this.router.register(IPC.INSTANCES_RELOAD_ACTIVE, {
      handler: () => views.reloadActive(),
    });

    this.router.register(IPC.THEMES_LIST, { handler: () => themes.list() });

    this.router.register(IPC.THEMES_SET, {
      input: themeIdSchema,
      handler: (id) => {
        if (!themes.get(id)) throw new Error(`unknown theme: ${id}`);
        settings.setTheme(id);
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

    this.router.register(IPC.SIDEBAR_UPDATE_LAYOUT, {
      input: sidebarLayoutSchema,
      handler: (layout) => {
        settings.setSidebarLayout(layout);
        return settings.state.sidebarLayout;
      },
    });

    this.router.register(IPC.APP_CLEAR_ALL_DATA, {
      handler: async () => {
        // Snapshot instance ids before we wipe state so ViewService can clear
        // every partition we know about.
        const instanceIds = settings.state.instances.map((i) => i.id);
        await views.clearAllData(instanceIds);
        await themes.clearAll();
        await settings.clearAll();
        // Reload the renderer so all in-memory state resets cleanly.
        const win = windowSvc.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.reloadIgnoringCache();
        }
      },
    });
  }

  dispose(): void {
    this.router.dispose();
  }
}
