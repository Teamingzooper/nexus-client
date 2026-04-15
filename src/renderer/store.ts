import { create } from 'zustand';
import type { LoadedModule, Theme, AppState, SidebarLayout } from '../shared/types';
import { defaultLayout } from '../shared/sidebarLayout';

interface NexusStore {
  modules: LoadedModule[];
  themes: Theme[];
  state: AppState;
  unread: Record<string, number>;
  ready: boolean;
  error: string | null;
  previewTheme: Theme | null;

  init(): Promise<void>;
  activate(id: string): Promise<void>;
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  reload(): Promise<void>;
  reloadActive(): Promise<void>;
  setTheme(id: string): Promise<void>;
  saveTheme(theme: Theme): Promise<void>;
  deleteTheme(id: string): Promise<void>;
  exportThemePack(ids: string[], meta?: { name?: string; author?: string }): Promise<{ canceled: boolean; path?: string; count?: number }>;
  importThemePack(): Promise<{ canceled: boolean; added?: Theme[] }>;
  setPreviewTheme(theme: Theme | null): void;
  updateLayout(layout: SidebarLayout): Promise<void>;
}

const DEFAULT_STATE: AppState = {
  activeModuleId: null,
  enabledModuleIds: [],
  themeId: 'nexus-dark',
  sidebarLayout: defaultLayout(),
};

export const useNexus = create<NexusStore>((set, get) => ({
  modules: [],
  themes: [],
  state: DEFAULT_STATE,
  unread: {},
  ready: false,
  error: null,
  previewTheme: null,

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

  async activate(id) {
    await window.nexus.activateModule(id);
    set((s) => ({
      state: {
        ...s.state,
        activeModuleId: id,
        enabledModuleIds: s.state.enabledModuleIds.includes(id)
          ? s.state.enabledModuleIds
          : [...s.state.enabledModuleIds, id],
      },
    }));
  },

  async enable(id) {
    await window.nexus.enableModule(id);
    const state = await window.nexus.getState();
    set({ state });
  },

  async disable(id) {
    await window.nexus.disableModule(id);
    const state = await window.nexus.getState();
    set((s) => {
      const unread = { ...s.unread };
      delete unread[id];
      return { state, unread };
    });
  },

  async reload() {
    const modules = await window.nexus.reloadModules();
    set({ modules });
  },

  async reloadActive() {
    await window.nexus.reloadActiveModule();
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
      // Revert on failure by re-fetching.
      const state = await window.nexus.getState();
      set({ state });
      throw err;
    }
  },
}));
