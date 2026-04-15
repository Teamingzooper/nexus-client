import { z } from 'zod';
import { IPC } from '../../shared/types';
import {
  boundsSchema,
  moduleIdSchema,
  themeIdSchema,
  themeSchema,
} from '../../shared/schemas';
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

    this.router.register(IPC.MODULES_LIST, { handler: () => registry.list() });

    this.router.register(IPC.MODULES_RELOAD, { handler: () => registry.reload() });

    this.router.register(IPC.MODULES_ACTIVATE, {
      input: moduleIdSchema,
      handler: (id) => {
        if (!registry.get(id)) throw new Error(`unknown module: ${id}`);
        if (!settings.state.enabledModuleIds.includes(id)) settings.enableModule(id);
        views.activate(id);
        settings.setActive(id);
      },
    });

    this.router.register(IPC.MODULES_ENABLE, {
      input: moduleIdSchema,
      handler: (id) => {
        if (!registry.get(id)) throw new Error(`unknown module: ${id}`);
        settings.enableModule(id);
      },
    });

    this.router.register(IPC.MODULES_DISABLE, {
      input: moduleIdSchema,
      handler: (id) => {
        views.destroy(id);
        settings.disableModule(id);
        ctx.bus.emit('module:disabled', { moduleId: id });
      },
    });

    this.router.register(IPC.MODULES_OPEN_DIR, { handler: () => registry.openUserDir() });

    this.router.register(IPC.MODULES_RELOAD_ACTIVE, {
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
  }

  dispose(): void {
    this.router.dispose();
  }
}
