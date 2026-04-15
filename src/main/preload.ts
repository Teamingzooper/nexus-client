import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  LoadedModule,
  Theme,
  AppState,
  UnreadUpdate,
  Bounds,
  SidebarLayout,
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
  activateModule: (id: string): Promise<void> => invoke(IPC.MODULES_ACTIVATE, id),
  enableModule: (id: string): Promise<void> => invoke(IPC.MODULES_ENABLE, id),
  disableModule: (id: string): Promise<void> => invoke(IPC.MODULES_DISABLE, id),
  openModulesDir: (): Promise<void> => invoke(IPC.MODULES_OPEN_DIR),
  reloadActiveModule: (): Promise<void> => invoke(IPC.MODULES_RELOAD_ACTIVE),

  listThemes: (): Promise<Theme[]> => invoke(IPC.THEMES_LIST),
  setTheme: (id: string): Promise<void> => invoke(IPC.THEMES_SET, id),
  saveTheme: (theme: Theme): Promise<Theme[]> => invoke(IPC.THEMES_SAVE, theme),
  deleteTheme: (id: string): Promise<Theme[]> => invoke(IPC.THEMES_DELETE, id),

  getState: (): Promise<AppState> => invoke(IPC.STATE_GET),
  setContentBounds: (bounds: Bounds): Promise<void> => invoke(IPC.LAYOUT_SET_BOUNDS, bounds),
  setViewsSuspended: (suspended: boolean): Promise<void> =>
    invoke(IPC.LAYOUT_SUSPEND, suspended),
  updateSidebarLayout: (layout: SidebarLayout): Promise<SidebarLayout> =>
    invoke(IPC.SIDEBAR_UPDATE_LAYOUT, layout),

  onUnread: (cb: (update: UnreadUpdate) => void): (() => void) => {
    const listener = (_: unknown, update: UnreadUpdate) => cb(update);
    ipcRenderer.on(IPC.UNREAD_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.UNREAD_UPDATE, listener);
  },
  getAllUnread: (): Promise<Record<string, number>> => invoke(IPC.UNREAD_ALL),
};

contextBridge.exposeInMainWorld('nexus', api);

export type NexusApi = typeof api;
