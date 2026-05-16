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

export interface UpdateInfo {
  version: string;
  releaseName?: string | null;
  releaseNotes?: string | null;
  releaseDate?: string | null;
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | ({ state: 'available' } & UpdateInfo)
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | ({ state: 'downloaded' } & UpdateInfo)
  | { state: 'error'; message: string };

declare global {
  interface Window {
    nexus: {
      platform: NodeJS.Platform;
      listModules(): Promise<LoadedModule[]>;
      reloadModules(): Promise<LoadedModule[]>;
      openModulesDir(): Promise<void>;

      addInstance(moduleId: string): Promise<ModuleInstance>;
      removeInstance(instanceId: string): Promise<void>;
      renameInstance(instanceId: string, name: string): Promise<void>;
      activateInstance(instanceId: string): Promise<void>;
      reloadActiveInstance(): Promise<void>;
      setInstanceMuted(instanceId: string, muted: boolean): Promise<void>;

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
      exportPrefs(): Promise<{ canceled: true } | { canceled: false; path: string }>;
      importPrefs(): Promise<{ canceled: true } | { canceled: false; path: string }>;

      getState(): Promise<AppState>;
      setContentBounds(bounds: Bounds): Promise<void>;
      setViewsSuspended(suspended: boolean): Promise<void>;
      updateSidebarLayout(layout: SidebarLayout): Promise<SidebarLayout>;
      clearAllData(): Promise<void>;

      onUnread(cb: (update: UnreadUpdate) => void): () => void;
      onMenu(cb: (event: string) => void): () => void;
      onInstanceActivated(cb: (instanceId: string) => void): () => void;
      onViewCrashed(
        cb: (info: { instanceId: string; reason: string }) => void,
      ): () => void;
      getAllUnread(): Promise<Record<string, number>>;
      setNotificationsEnabled(enabled: boolean): Promise<void>;
      setNotificationSound(enabled: boolean): Promise<void>;
      setNotificationPrivacyMode(enabled: boolean): Promise<void>;
      setDnd(enabled: boolean, start: string, end: string): Promise<void>;
      setLaunchAtLogin(enabled: boolean): Promise<void>;
      setSidebarCompact(enabled: boolean): Promise<void>;
      setSidebarWidth(width: number): Promise<void>;
      setCloseToTray(enabled: boolean): Promise<void>;
      setGlobalShortcutEnabled(enabled: boolean): Promise<void>;
      setGlobalShortcut(accelerator: string): Promise<void>;
      testNotification(instanceId?: string | null): Promise<boolean>;

      listProfiles(): Promise<ProfileSummary[]>;
      currentProfile(): Promise<ProfileSummary | null>;
      getProfileState(): Promise<{
        current: ProfileSummary | null;
        state: {
          activeInstanceId: string | null;
          instances: ModuleInstance[];
          sidebarLayout?: SidebarLayout;
        } | null;
      }>;
      createProfile(name: string, password?: string): Promise<ProfileSummary>;
      unlockProfile(id: string, password?: string): Promise<ProfileSummary | null>;
      lockProfile(): Promise<void>;
      deleteProfile(id: string): Promise<void>;
      renameProfile(id: string, name: string): Promise<void>;
      changeProfilePassword(
        id: string,
        oldPassword: string | null,
        newPassword: string | null,
      ): Promise<void>;

      checkForUpdates(): Promise<UpdateStatus>;
      downloadUpdate(): Promise<UpdateStatus>;
      installUpdate(): Promise<void>;
      getUpdaterStatus(): Promise<UpdateStatus>;
      onUpdaterStatus(cb: (status: UpdateStatus) => void): () => void;
      getAppVersion(): Promise<{ version: string; isPackaged: boolean }>;

      listCommunityModules(): Promise<{
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
      }>;
      installCommunityModule(moduleId: string, overwrite?: boolean): Promise<void>;
    };
  }
}

export {};
