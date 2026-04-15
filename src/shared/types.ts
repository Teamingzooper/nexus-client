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
} as const;
