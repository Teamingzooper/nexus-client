import { z } from 'zod';
import {
  manifestSchema,
  themeSchema,
  themeColorsSchema,
  appStateSchema,
  notificationSchema,
  boundsSchema,
} from './schemas';

export type ModuleManifest = z.infer<typeof manifestSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type NotificationStrategySpec = z.infer<typeof notificationSchema>;
export type Bounds = z.infer<typeof boundsSchema>;

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
  MODULES_ACTIVATE: 'nexus:modules:activate',
  MODULES_ENABLE: 'nexus:modules:enable',
  MODULES_DISABLE: 'nexus:modules:disable',
  MODULES_OPEN_DIR: 'nexus:modules:open-dir',
  MODULES_RELOAD: 'nexus:modules:reload',
  MODULES_RELOAD_ACTIVE: 'nexus:modules:reload-active',
  THEMES_LIST: 'nexus:themes:list',
  THEMES_SET: 'nexus:themes:set',
  THEMES_SAVE: 'nexus:themes:save',
  THEMES_DELETE: 'nexus:themes:delete',
  STATE_GET: 'nexus:state:get',
  LAYOUT_SET_BOUNDS: 'nexus:layout:set-bounds',
  LAYOUT_SUSPEND: 'nexus:layout:suspend',
  UNREAD_UPDATE: 'nexus:unread:update',
  UNREAD_ALL: 'nexus:unread:all',
} as const;
