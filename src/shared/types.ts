import { z } from 'zod';
import {
  manifestSchema,
  themeSchema,
  themeColorsSchema,
  themePackSchema,
  appStateSchema,
  notificationSchema,
  boundsSchema,
} from './schemas';

export type ModuleManifest = z.infer<typeof manifestSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type ThemePack = z.infer<typeof themePackSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type NotificationStrategySpec = z.infer<typeof notificationSchema>;
export type Bounds = z.infer<typeof boundsSchema>;
export type { SidebarLayout, SidebarGroup, DropTarget } from './sidebarLayout';
export type { ModuleInstance } from './instance';
export type { ProfileMeta, ProfileState } from './profile';

/** Lightweight summary shown in the UI — never includes crypto material. */
export interface ProfileSummary {
  id: string;
  name: string;
  createdAt: number;
  hasPassword: boolean;
}

export interface LoadedModule {
  manifest: ModuleManifest;
  path: string;
  iconDataUrl?: string;
}

export interface UnreadUpdate {
  moduleId: string;
  count: number;
  preview?: string;
}

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export const IPC = {
  MODULES_LIST: 'nexus:modules:list',
  MODULES_OPEN_DIR: 'nexus:modules:open-dir',
  MODULES_RELOAD: 'nexus:modules:reload',
  INSTANCES_ACTIVATE: 'nexus:instances:activate',
  /**
   * Push-event channel: main → renderer. Fires whenever the active instance
   * changes for any reason (sidebar click, notification click, command
   * palette, etc.). Renderer listens to keep its sidebar highlight in sync
   * with whatever main has activated.
   */
  INSTANCE_ACTIVATED: 'nexus:instance:activated',
  INSTANCES_ADD: 'nexus:instances:add',
  INSTANCES_REMOVE: 'nexus:instances:remove',
  INSTANCES_RENAME: 'nexus:instances:rename',
  INSTANCES_RELOAD_ACTIVE: 'nexus:instances:reload-active',
  INSTANCES_SET_MUTED: 'nexus:instances:set-muted',
  /**
   * Push-event channel: main → renderer. Fires when a WebContentsView's
   * renderer process dies (`render-process-gone` event). Renderer shows
   * the CrashOverlay component over the affected instance's content area
   * so the user can reload or dismiss.
   */
  VIEW_CRASHED: 'nexus:view:crashed',
  THEMES_LIST: 'nexus:themes:list',
  THEMES_SET: 'nexus:themes:set',
  THEMES_SAVE: 'nexus:themes:save',
  THEMES_DELETE: 'nexus:themes:delete',
  THEMES_EXPORT_PACK: 'nexus:themes:export-pack',
  THEMES_IMPORT_PACK: 'nexus:themes:import-pack',
  STATE_GET: 'nexus:state:get',
  LAYOUT_SET_BOUNDS: 'nexus:layout:set-bounds',
  LAYOUT_SUSPEND: 'nexus:layout:suspend',
  SIDEBAR_UPDATE_LAYOUT: 'nexus:sidebar:update-layout',
  APP_CLEAR_ALL_DATA: 'nexus:app:clear-all-data',
  UNREAD_UPDATE: 'nexus:unread:update',
  UNREAD_ALL: 'nexus:unread:all',
  NOTIFY_SHOW: 'nexus:notify:show',
  NOTIFY_SET_ENABLED: 'nexus:notify:set-enabled',
  NOTIFY_SET_SOUND: 'nexus:notify:set-sound',
  NOTIFY_SET_PRIVACY: 'nexus:notify:set-privacy',
  NOTIFY_SET_DND: 'nexus:notify:set-dnd',
  NOTIFY_TEST: 'nexus:notify:test',
  PREFS_SET_LAUNCH_AT_LOGIN: 'nexus:prefs:set-launch-at-login',
  PREFS_SET_SIDEBAR_COMPACT: 'nexus:prefs:set-sidebar-compact',
  PREFS_SET_SIDEBAR_WIDTH: 'nexus:prefs:set-sidebar-width',
  PREFS_SET_CLOSE_TO_TRAY: 'nexus:prefs:set-close-to-tray',
  PREFS_SET_GLOBAL_SHORTCUT_ENABLED: 'nexus:prefs:set-global-shortcut-enabled',
  PREFS_SET_GLOBAL_SHORTCUT: 'nexus:prefs:set-global-shortcut',
  PROFILES_LIST: 'nexus:profiles:list',
  PROFILES_CURRENT: 'nexus:profiles:current',
  PROFILES_STATE: 'nexus:profiles:state',
  PROFILES_CREATE: 'nexus:profiles:create',
  PROFILES_UNLOCK: 'nexus:profiles:unlock',
  PROFILES_LOCK: 'nexus:profiles:lock',
  PROFILES_DELETE: 'nexus:profiles:delete',
  PROFILES_RENAME: 'nexus:profiles:rename',
  PROFILES_CHANGE_PASSWORD: 'nexus:profiles:change-password',
  UPDATER_CHECK: 'nexus:updater:check',
  UPDATER_DOWNLOAD: 'nexus:updater:download',
  UPDATER_INSTALL: 'nexus:updater:install',
  UPDATER_STATUS: 'nexus:updater:status',
  APP_VERSION: 'nexus:app:version',
  PREFS_EXPORT: 'nexus:prefs:export',
  PREFS_IMPORT: 'nexus:prefs:import',
  COMMUNITY_MODULES_LIST: 'nexus:community-modules:list',
  COMMUNITY_MODULES_INSTALL: 'nexus:community-modules:install',
} as const;
