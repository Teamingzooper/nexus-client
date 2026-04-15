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
  getAllUnread: (): Promise<Record<string, number>> => invoke(IPC.UNREAD_ALL),
  setNotificationsEnabled: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_ENABLED, enabled),
};

contextBridge.exposeInMainWorld('nexus', api);

export type NexusApi = typeof api;
