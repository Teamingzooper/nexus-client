export type NotificationStrategy =
  | { kind: 'dom'; selector: string; parse?: 'int' | 'text' }
  | { kind: 'title'; pattern?: string }
  | { kind: 'custom' }
  | { kind: 'none' };

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  url: string;
  icon?: string;
  partition?: string;
  userAgent?: string;
  permissions?: string[];
  inject?: {
    css?: string;
    preload?: string;
  };
  notifications?: NotificationStrategy;
}

export interface LoadedModule {
  manifest: ModuleManifest;
  path: string;
  iconDataUrl?: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: {
    bg: string;
    sidebar: string;
    sidebarHover: string;
    accent: string;
    accentFg: string;
    text: string;
    textMuted: string;
    border: string;
    badge: string;
    badgeFg: string;
  };
}

export interface UnreadUpdate {
  moduleId: string;
  count: number;
  preview?: string;
}

export interface AppState {
  activeModuleId: string | null;
  enabledModuleIds: string[];
  themeId: string;
}

export const IPC = {
  MODULES_LIST: 'nexus:modules:list',
  MODULES_ACTIVATE: 'nexus:modules:activate',
  MODULES_ENABLE: 'nexus:modules:enable',
  MODULES_DISABLE: 'nexus:modules:disable',
  MODULES_OPEN_DIR: 'nexus:modules:open-dir',
  MODULES_RELOAD: 'nexus:modules:reload',
  THEMES_LIST: 'nexus:themes:list',
  THEMES_SET: 'nexus:themes:set',
  THEMES_SAVE: 'nexus:themes:save',
  STATE_GET: 'nexus:state:get',
  LAYOUT_SET_BOUNDS: 'nexus:layout:set-bounds',
  LAYOUT_SUSPEND: 'nexus:layout:suspend',
  UNREAD_UPDATE: 'nexus:unread:update',
  UNREAD_ALL: 'nexus:unread:all',
} as const;
