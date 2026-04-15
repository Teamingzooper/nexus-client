import type {
  LoadedModule,
  Theme,
  AppState,
  UnreadUpdate,
  Bounds,
  SidebarLayout,
  ModuleInstance,
} from '../shared/types';

declare global {
  interface Window {
    nexus: {
      listModules(): Promise<LoadedModule[]>;
      reloadModules(): Promise<LoadedModule[]>;
      openModulesDir(): Promise<void>;

      addInstance(moduleId: string): Promise<ModuleInstance>;
      removeInstance(instanceId: string): Promise<void>;
      renameInstance(instanceId: string, name: string): Promise<void>;
      activateInstance(instanceId: string): Promise<void>;
      reloadActiveInstance(): Promise<void>;

      listThemes(): Promise<Theme[]>;
      setTheme(id: string): Promise<void>;
      saveTheme(theme: Theme): Promise<Theme[]>;
      deleteTheme(id: string): Promise<Theme[]>;
      exportThemePack(
        ids: string[],
        meta?: { name?: string; author?: string },
      ): Promise<{ canceled: true } | { canceled: false; path: string; count: number }>;
      importThemePack(): Promise<
        { canceled: true } | { canceled: false; added: Theme[]; themes: Theme[] }
      >;

      getState(): Promise<AppState>;
      setContentBounds(bounds: Bounds): Promise<void>;
      setViewsSuspended(suspended: boolean): Promise<void>;
      updateSidebarLayout(layout: SidebarLayout): Promise<SidebarLayout>;
      clearAllData(): Promise<void>;

      onUnread(cb: (update: UnreadUpdate) => void): () => void;
      getAllUnread(): Promise<Record<string, number>>;
      setNotificationsEnabled(enabled: boolean): Promise<void>;
    };
  }
}

export {};
