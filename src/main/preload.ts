import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  LoadedModule,
  Theme,
  AppState,
  UnreadUpdate,
} from '../shared/types';

type UnreadMap = Record<string, number>;

const api = {
  listModules: (): Promise<LoadedModule[]> => ipcRenderer.invoke(IPC.MODULES_LIST),
  activateModule: (id: string): Promise<void> => ipcRenderer.invoke(IPC.MODULES_ACTIVATE, id),
  enableModule: (id: string): Promise<void> => ipcRenderer.invoke(IPC.MODULES_ENABLE, id),
  disableModule: (id: string): Promise<void> => ipcRenderer.invoke(IPC.MODULES_DISABLE, id),
  reloadModules: (): Promise<LoadedModule[]> => ipcRenderer.invoke(IPC.MODULES_RELOAD),
  openModulesDir: (): Promise<void> => ipcRenderer.invoke(IPC.MODULES_OPEN_DIR),

  listThemes: (): Promise<Theme[]> => ipcRenderer.invoke(IPC.THEMES_LIST),
  setTheme: (id: string): Promise<void> => ipcRenderer.invoke(IPC.THEMES_SET, id),
  saveTheme: (theme: Theme): Promise<Theme[]> => ipcRenderer.invoke(IPC.THEMES_SAVE, theme),

  getState: (): Promise<AppState> => ipcRenderer.invoke(IPC.STATE_GET),
  setContentBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke(IPC.LAYOUT_SET_BOUNDS, bounds),
  setViewsSuspended: (suspended: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.LAYOUT_SUSPEND, suspended),

  onUnread: (cb: (update: UnreadUpdate) => void): (() => void) => {
    const listener = (_: unknown, update: UnreadUpdate) => cb(update);
    ipcRenderer.on(IPC.UNREAD_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.UNREAD_UPDATE, listener);
  },
  getAllUnread: (): Promise<UnreadMap> => ipcRenderer.invoke(IPC.UNREAD_ALL),
};

contextBridge.exposeInMainWorld('nexus', api);

export type NexusApi = typeof api;
