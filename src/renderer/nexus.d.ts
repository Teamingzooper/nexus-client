import type { LoadedModule, Theme, AppState, UnreadUpdate, Bounds } from '../shared/types';

declare global {
  interface Window {
    nexus: {
      listModules(): Promise<LoadedModule[]>;
      reloadModules(): Promise<LoadedModule[]>;
      activateModule(id: string): Promise<void>;
      enableModule(id: string): Promise<void>;
      disableModule(id: string): Promise<void>;
      openModulesDir(): Promise<void>;
      reloadActiveModule(): Promise<void>;

      listThemes(): Promise<Theme[]>;
      setTheme(id: string): Promise<void>;
      saveTheme(theme: Theme): Promise<Theme[]>;
      deleteTheme(id: string): Promise<Theme[]>;

      getState(): Promise<AppState>;
      setContentBounds(bounds: Bounds): Promise<void>;
      setViewsSuspended(suspended: boolean): Promise<void>;

      onUnread(cb: (update: UnreadUpdate) => void): () => void;
      getAllUnread(): Promise<Record<string, number>>;
    };
  }
}

export {};
