import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  LoadedModule,
  Theme,
  AppState,
  UnreadUpdate,
  Bounds,
  SidebarLayout,
  ModuleInstance,
  ProfileSummary,
} from '../shared/types';

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result: Envelope<T> = await ipcRenderer.invoke(channel, payload);
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error(`invalid ipc response from ${channel}`);
  }
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

const api = {
  platform: process.platform as NodeJS.Platform,
  listModules: (): Promise<LoadedModule[]> => invoke(IPC.MODULES_LIST),
  reloadModules: (): Promise<LoadedModule[]> => invoke(IPC.MODULES_RELOAD),
  openModulesDir: (): Promise<void> => invoke(IPC.MODULES_OPEN_DIR),

  addInstance: (moduleId: string): Promise<ModuleInstance> =>
    invoke(IPC.INSTANCES_ADD, moduleId),
  removeInstance: (instanceId: string): Promise<void> =>
    invoke(IPC.INSTANCES_REMOVE, instanceId),
  renameInstance: (instanceId: string, name: string): Promise<void> =>
    invoke(IPC.INSTANCES_RENAME, { id: instanceId, name }),
  activateInstance: (instanceId: string): Promise<void> =>
    invoke(IPC.INSTANCES_ACTIVATE, instanceId),
  reloadActiveInstance: (): Promise<void> => invoke(IPC.INSTANCES_RELOAD_ACTIVE),
  setInstanceMuted: (instanceId: string, muted: boolean): Promise<void> =>
    invoke(IPC.INSTANCES_SET_MUTED, { id: instanceId, muted }),

  listThemes: (): Promise<Theme[]> => invoke(IPC.THEMES_LIST),
  setTheme: (id: string): Promise<void> => invoke(IPC.THEMES_SET, id),
  saveTheme: (theme: Theme): Promise<Theme[]> => invoke(IPC.THEMES_SAVE, theme),
  deleteTheme: (id: string): Promise<Theme[]> => invoke(IPC.THEMES_DELETE, id),
  exportThemePack: (
    ids: string[],
    meta?: { name?: string; author?: string },
  ): Promise<{ canceled: true } | { canceled: false; path: string; count: number }> =>
    invoke(IPC.THEMES_EXPORT_PACK, { ids, ...meta }),
  importThemePack: (): Promise<
    { canceled: true } | { canceled: false; added: Theme[]; themes: Theme[] }
  > => invoke(IPC.THEMES_IMPORT_PACK),
  exportPrefs: (): Promise<{ canceled: true } | { canceled: false; path: string }> =>
    invoke(IPC.PREFS_EXPORT),
  importPrefs: (): Promise<{ canceled: true } | { canceled: false; path: string }> =>
    invoke(IPC.PREFS_IMPORT),

  getState: (): Promise<AppState> => invoke(IPC.STATE_GET),
  setContentBounds: (bounds: Bounds): Promise<void> => invoke(IPC.LAYOUT_SET_BOUNDS, bounds),
  setViewsSuspended: (suspended: boolean): Promise<void> =>
    invoke(IPC.LAYOUT_SUSPEND, suspended),
  updateSidebarLayout: (layout: SidebarLayout): Promise<SidebarLayout> =>
    invoke(IPC.SIDEBAR_UPDATE_LAYOUT, layout),
  clearAllData: (): Promise<void> => invoke(IPC.APP_CLEAR_ALL_DATA),

  onUnread: (cb: (update: UnreadUpdate) => void): (() => void) => {
    const listener = (_: unknown, update: UnreadUpdate) => cb(update);
    ipcRenderer.on(IPC.UNREAD_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.UNREAD_UPDATE, listener);
  },
  onMenu: (cb: (event: string) => void): (() => void) => {
    const listener = (_: unknown, payload: { event: string }) => cb(payload.event);
    ipcRenderer.on('nexus:menu', listener);
    return () => ipcRenderer.removeListener('nexus:menu', listener);
  },
  onInstanceActivated: (cb: (instanceId: string) => void): (() => void) => {
    const listener = (_: unknown, payload: { instanceId: string }) => cb(payload.instanceId);
    ipcRenderer.on(IPC.INSTANCE_ACTIVATED, listener);
    return () => ipcRenderer.removeListener(IPC.INSTANCE_ACTIVATED, listener);
  },
  onViewCrashed: (
    cb: (info: { instanceId: string; reason: string }) => void,
  ): (() => void) => {
    const listener = (_: unknown, payload: { instanceId: string; reason: string }) =>
      cb(payload);
    ipcRenderer.on(IPC.VIEW_CRASHED, listener);
    return () => ipcRenderer.removeListener(IPC.VIEW_CRASHED, listener);
  },
  getAllUnread: (): Promise<Record<string, number>> => invoke(IPC.UNREAD_ALL),
  setNotificationsEnabled: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_ENABLED, enabled),
  setNotificationSound: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_SOUND, enabled),
  setNotificationPrivacyMode: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_PRIVACY, enabled),
  setDnd: (enabled: boolean, start: string, end: string): Promise<void> =>
    invoke(IPC.NOTIFY_SET_DND, { enabled, start, end }),
  setLaunchAtLogin: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_LAUNCH_AT_LOGIN, enabled),
  setSidebarCompact: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_SIDEBAR_COMPACT, enabled),
  setSidebarWidth: (width: number): Promise<void> =>
    invoke(IPC.PREFS_SET_SIDEBAR_WIDTH, width),
  setCloseToTray: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_CLOSE_TO_TRAY, enabled),
  setGlobalShortcutEnabled: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_GLOBAL_SHORTCUT_ENABLED, enabled),
  setGlobalShortcut: (accelerator: string): Promise<void> =>
    invoke(IPC.PREFS_SET_GLOBAL_SHORTCUT, accelerator),
  testNotification: (instanceId?: string | null): Promise<boolean> =>
    invoke(IPC.NOTIFY_TEST, instanceId ?? null),

  // Profiles
  listProfiles: (): Promise<ProfileSummary[]> => invoke(IPC.PROFILES_LIST),
  currentProfile: (): Promise<ProfileSummary | null> => invoke(IPC.PROFILES_CURRENT),
  getProfileState: (): Promise<{
    current: ProfileSummary | null;
    state: {
      activeInstanceId: string | null;
      instances: ModuleInstance[];
      sidebarLayout?: SidebarLayout;
    } | null;
  }> => invoke(IPC.PROFILES_STATE),
  createProfile: (name: string, password?: string): Promise<ProfileSummary> =>
    invoke(IPC.PROFILES_CREATE, { name, password }),
  unlockProfile: (id: string, password?: string): Promise<ProfileSummary | null> =>
    invoke(IPC.PROFILES_UNLOCK, { id, password }),
  lockProfile: (): Promise<void> => invoke(IPC.PROFILES_LOCK),
  deleteProfile: (id: string): Promise<void> => invoke(IPC.PROFILES_DELETE, id),
  renameProfile: (id: string, name: string): Promise<void> =>
    invoke(IPC.PROFILES_RENAME, { id, name }),
  changeProfilePassword: (
    id: string,
    oldPassword: string | null,
    newPassword: string | null,
  ): Promise<void> =>
    invoke(IPC.PROFILES_CHANGE_PASSWORD, { id, oldPassword, newPassword }),

  // Updater
  checkForUpdates: (): Promise<unknown> => invoke(IPC.UPDATER_CHECK),
  downloadUpdate: (): Promise<unknown> => invoke(IPC.UPDATER_DOWNLOAD),
  installUpdate: (): Promise<void> => invoke(IPC.UPDATER_INSTALL),
  getUpdaterStatus: (): Promise<unknown> => invoke(IPC.UPDATER_STATUS),
  getAppVersion: (): Promise<{ version: string; isPackaged: boolean }> =>
    invoke(IPC.APP_VERSION),

  // Community modules
  listCommunityModules: (): Promise<{
    tag: string;
    name: string;
    modules: {
      id: string;
      name: string;
      version: string;
      author: string | null;
      description: string | null;
      url: string;
      zip: string;
    }[];
  }> => invoke(IPC.COMMUNITY_MODULES_LIST),
  installCommunityModule: (moduleId: string, overwrite = false): Promise<void> =>
    invoke(IPC.COMMUNITY_MODULES_INSTALL, { moduleId, overwrite }),
  onUpdaterStatus: (cb: (status: unknown) => void): (() => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('nexus:updater:status', listener);
    return () => ipcRenderer.removeListener('nexus:updater:status', listener);
  },
};

contextBridge.exposeInMainWorld('nexus', api);

export type NexusApi = typeof api;
