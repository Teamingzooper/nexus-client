import { create } from 'zustand';
import type {
  LoadedModule,
  Theme,
  AppState,
  SidebarLayout,
  ModuleInstance,
} from '../shared/types';
import { defaultLayout } from '../shared/sidebarLayout';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: true;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface NexusStore {
  modules: LoadedModule[];
  themes: Theme[];
  state: AppState;
  unread: Record<string, number>;
  ready: boolean;
  error: string | null;
  previewTheme: Theme | null;
  confirm: ConfirmState | null;
  addInstanceOpen: boolean;
  settingsOpen: boolean;

  init(): Promise<void>;
  activateInstance(instanceId: string): Promise<void>;
  addInstance(moduleId: string): Promise<ModuleInstance>;
  removeInstance(instanceId: string): Promise<void>;
  renameInstance(instanceId: string, name: string): Promise<void>;
  reloadModules(): Promise<void>;
  reloadActiveInstance(): Promise<void>;
  setTheme(id: string): Promise<void>;
  saveTheme(theme: Theme): Promise<void>;
  deleteTheme(id: string): Promise<void>;
  exportThemePack(
    ids: string[],
    meta?: { name?: string; author?: string },
  ): Promise<{ canceled: boolean; path?: string; count?: number }>;
  importThemePack(): Promise<{ canceled: boolean; added?: Theme[] }>;
  setPreviewTheme(theme: Theme | null): void;
  updateLayout(layout: SidebarLayout): Promise<void>;
  clearAllData(): Promise<void>;

  // Confirm dialog
  showConfirm(opts: ConfirmOptions): Promise<boolean>;
  closeConfirm(): void;

  // Add-instance dialog
  openAddInstance(): void;
  closeAddInstance(): void;

  // Settings modal
  openSettings(): void;
  closeSettings(): void;
  toggleSettings(): void;
}

const DEFAULT_STATE: AppState = {
  activeInstanceId: null,
  instances: [],
  themeId: 'nexus-dark',
  sidebarLayout: defaultLayout(),
};

async function refreshState(): Promise<AppState> {
  return window.nexus.getState();
}

export const useNexus = create<NexusStore>((set, get) => ({
  modules: [],
  themes: [],
  state: DEFAULT_STATE,
  unread: {},
  ready: false,
  error: null,
  previewTheme: null,
  confirm: null,
  addInstanceOpen: false,
  settingsOpen: false,

  async init() {
    try {
      const [modules, themes, state, unread] = await Promise.all([
        window.nexus.listModules(),
        window.nexus.listThemes(),
        window.nexus.getState(),
        window.nexus.getAllUnread(),
      ]);
      set({ modules, themes, state, unread, ready: true, error: null });

      window.nexus.onUnread((update) => {
        set((s) => ({ unread: { ...s.unread, [update.moduleId]: update.count } }));
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), ready: true });
    }
  },

  async activateInstance(instanceId) {
    await window.nexus.activateInstance(instanceId);
    const state = await refreshState();
    set({ state });
  },

  async addInstance(moduleId) {
    const instance = await window.nexus.addInstance(moduleId);
    const state = await refreshState();
    set({ state });
    return instance;
  },

  async removeInstance(instanceId) {
    await window.nexus.removeInstance(instanceId);
    const state = await refreshState();
    set((s) => {
      const unread = { ...s.unread };
      delete unread[instanceId];
      return { state, unread };
    });
  },

  async renameInstance(instanceId, name) {
    await window.nexus.renameInstance(instanceId, name);
    const state = await refreshState();
    set({ state });
  },

  async reloadModules() {
    const modules = await window.nexus.reloadModules();
    set({ modules });
  },

  async reloadActiveInstance() {
    await window.nexus.reloadActiveInstance();
  },

  async setTheme(id) {
    await window.nexus.setTheme(id);
    set((s) => ({ state: { ...s.state, themeId: id } }));
  },

  async saveTheme(theme) {
    const themes = await window.nexus.saveTheme(theme);
    set({ themes });
  },

  async deleteTheme(id) {
    const themes = await window.nexus.deleteTheme(id);
    set((s) => ({
      themes,
      state: s.state.themeId === id ? { ...s.state, themeId: 'nexus-dark' } : s.state,
    }));
  },

  async exportThemePack(ids, meta) {
    const result = await window.nexus.exportThemePack(ids, meta);
    return result.canceled ? { canceled: true } : { canceled: false, path: result.path, count: result.count };
  },

  async importThemePack() {
    const result = await window.nexus.importThemePack();
    if (result.canceled) return { canceled: true };
    set({ themes: result.themes });
    return { canceled: false, added: result.added };
  },

  setPreviewTheme(theme) {
    set({ previewTheme: theme });
  },

  async updateLayout(layout) {
    // Optimistic update so drag feedback is instant.
    set((s) => ({ state: { ...s.state, sidebarLayout: layout } }));
    try {
      const saved = await window.nexus.updateSidebarLayout(layout);
      set((s) => ({ state: { ...s.state, sidebarLayout: saved } }));
    } catch (err) {
      const state = await refreshState();
      set({ state });
      throw err;
    }
  },

  async clearAllData() {
    await window.nexus.clearAllData();
    // Main process reloads the renderer after wiping; still reset in-memory
    // copies defensively in case the reload is slow.
    set({
      modules: [],
      themes: [],
      state: DEFAULT_STATE,
      unread: {},
      previewTheme: null,
    });
  },

  showConfirm(opts) {
    return new Promise<boolean>((resolve) => {
      set({
        confirm: {
          open: true,
          ...opts,
          onConfirm: () => {
            set({ confirm: null });
            resolve(true);
          },
          onCancel: () => {
            set({ confirm: null });
            resolve(false);
          },
        },
      });
    });
  },

  closeConfirm() {
    const c = get().confirm;
    if (c?.onCancel) c.onCancel();
    else set({ confirm: null });
  },

  openAddInstance() {
    set({ addInstanceOpen: true });
  },

  closeAddInstance() {
    set({ addInstanceOpen: false });
  },

  openSettings() {
    set({ settingsOpen: true });
  },

  closeSettings() {
    set({ settingsOpen: false });
  },

  toggleSettings() {
    set((s) => ({ settingsOpen: !s.settingsOpen }));
  },
}));
