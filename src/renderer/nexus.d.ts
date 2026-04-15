import type { LoadedModule, Theme, AppState, UnreadUpdate } from '../shared/types';

declare global {
  interface Window {
    nexus: {
      listModules(): Promise<LoadedModule[]>;
      activateModule(id: string): Promise<void>;
      enableModule(id: string): Promise<void>;
      disableModule(id: string): Promise<void>;
      reloadModules(): Promise<LoadedModule[]>;
      openModulesDir(): Promise<void>;
      listThemes(): Promise<Theme[]>;
      setTheme(id: string): Promise<void>;
      saveTheme(theme: Theme): Promise<Theme[]>;
      getState(): Promise<AppState>;
      setContentBounds(bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }): Promise<void>;
      setViewsSuspended(suspended: boolean): Promise<void>;
      onUnread(cb: (update: UnreadUpdate) => void): () => void;
      getAllUnread(): Promise<Record<string, number>>;
    };
  }
}

export {};
