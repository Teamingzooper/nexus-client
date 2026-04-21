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
  INSTANCES_ADD: 'nexus:instances:add',
  INSTANCES_REMOVE: 'nexus:instances:remove',
  INSTANCES_RENAME: 'nexus:instances:rename',
  INSTANCES_RELOAD_ACTIVE: 'nexus:instances:reload-active',
  INSTANCES_SET_MUTED: 'nexus:instances:set-muted',
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
  COMMUNITY_MODULES_LIST: 'nexus:community-modules:list',
  COMMUNITY_MODULES_INSTALL: 'nexus:community-modules:install',
  // Email mode
  EMAIL_COPY_JSON: 'nexus:email:copy-json',
  EMAIL_RUN_ACTION: 'nexus:email:run-action',
  EMAIL_PEEK_UPDATE: 'nexus:email:peek-update',
  EMAIL_GET_PEEK: 'nexus:email:get-peek',
  EMAIL_PEEK_CHANGED: 'nexus:email:peek-changed',
  EMAIL_VIPS_LIST: 'nexus:email:vips:list',
  EMAIL_VIPS_ADD: 'nexus:email:vips:add',
  EMAIL_VIPS_REMOVE: 'nexus:email:vips:remove',
  EMAIL_SET_PEEK_CONFIG: 'nexus:email:set-peek-config',
  // Hotkeys
  HOTKEYS_LIST: 'nexus:hotkeys:list',
  HOTKEYS_REBIND: 'nexus:hotkeys:rebind',
  HOTKEYS_RESET: 'nexus:hotkeys:reset',
} as const;

// ----- Email mode types -----

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailAttachment {
  name: string;
  sizeBytes: number | null;
}

export interface EmailData {
  provider: 'gmail' | 'outlook';
  account: string;
  messageId: string | null;
  threadId: string | null;
  date: string; // ISO 8601
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  labels: string[];
  attachments: EmailAttachment[];
}

export interface PeekItem {
  messageId: string | null;
  threadId: string | null;
  from: EmailAddress;
  subject: string;
  snippet: string;
  date: string; // ISO 8601
  unread: boolean;
  isVip: boolean;
}

export interface VipEntry {
  email: string;
  label?: string;
  sound?: string;
}

export interface HotkeyAction {
  id: string;                          // e.g. "email.copyAsJson"
  label: string;                       // human-readable name
  description?: string;
  defaultBinding: string | null;       // e.g. "Cmd+Shift+C"
  currentBinding: string | null;
}

export type EmailPeekVisibility = 'always' | 'hover' | 'hidden';
export type EmailPeekGrouping = 'by-account' | 'unified';

export interface EmailPeekConfig {
  visible: EmailPeekVisibility;
  perAccount: number;
  grouping: EmailPeekGrouping;
}
