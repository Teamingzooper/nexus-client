import { create } from 'zustand';
import type { LoadedModule, Theme, AppState } from '../shared/types';

interface NexusStore {
  modules: LoadedModule[];
  themes: Theme[];
  state: AppState;
  unread: Record<string, number>;
  ready: boolean;

  init(): Promise<void>;
  activate(id: string): Promise<void>;
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  reload(): Promise<void>;
  setTheme(id: string): Promise<void>;
  saveTheme(theme: Theme): Promise<void>;
  setUnread(moduleId: string, count: number): void;
}

const DEFAULT_STATE: AppState = {
  activeModuleId: null,
  enabledModuleIds: [],
  themeId: 'nexus-dark',
};

export const useNexus = create<NexusStore>((set, get) => ({
  modules: [],
  themes: [],
  state: DEFAULT_STATE,
  unread: {},
  ready: false,

  async init() {
    const [modules, themes, state, unread] = await Promise.all([
      window.nexus.listModules(),
      window.nexus.listThemes(),
      window.nexus.getState(),
      window.nexus.getAllUnread(),
    ]);
    set({ modules, themes, state, unread, ready: true });

    window.nexus.onUnread((update) => {
      set((s) => ({ unread: { ...s.unread, [update.moduleId]: update.count } }));
    });
  },

  async activate(id) {
    await window.nexus.activateModule(id);
    set((s) => ({ state: { ...s.state, activeModuleId: id } }));
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

  async setTheme(id) {
    await window.nexus.setTheme(id);
    set((s) => ({ state: { ...s.state, themeId: id } }));
  },

  async saveTheme(theme) {
    const themes = await window.nexus.saveTheme(theme);
    set({ themes });
  },

  setUnread(moduleId, count) {
    set((s) => ({ unread: { ...s.unread, [moduleId]: count } }));
  },
}));
