import { create } from 'zustand';
import type {
  LoadedModule,
  Theme,
  AppState,
  SidebarLayout,
  ModuleInstance,
  ProfileSummary,
  ProfileState,
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

/**
 * Composite view exposed to renderer components. Merges global app state
 * (themes, window, prefs, activeProfileId) with the CURRENT profile's
 * state (instances, layout, activeInstanceId). Components read this as
 * `state.whatever` without caring whether a field is global or per-profile.
 * When no profile is unlocked, the profile-level fields are empty.
 */
type CompositeState = AppState & {
  instances: ModuleInstance[];
  activeInstanceId: string | null;
  sidebarLayout?: SidebarLayout;
};

interface NexusStore {
  modules: LoadedModule[];
  themes: Theme[];
  state: CompositeState;
  unread: Record<string, number>;
  ready: boolean;
  error: string | null;
  previewTheme: Theme | null;
  confirm: ConfirmState | null;
  addInstanceOpen: boolean;
  settingsOpen: boolean;
  overlayCount: number;

  // Profiles
  profiles: ProfileSummary[];
  currentProfile: ProfileSummary | null;
  accountManagerOpen: boolean;

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
  setNotificationsEnabled(enabled: boolean): Promise<void>;
  setNotificationSound(enabled: boolean): Promise<void>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  setSidebarCompact(enabled: boolean): Promise<void>;
  testNotification(): Promise<boolean>;
  exportThemePack(
    ids: string[],
    meta?: { name?: string; author?: string },
  ): Promise<{ canceled: boolean; path?: string; count?: number }>;
  importThemePack(): Promise<{ canceled: boolean; added?: Theme[] }>;
  setPreviewTheme(theme: Theme | null): void;
  updateLayout(layout: SidebarLayout): Promise<void>;
  clearAllData(): Promise<void>;

  // Profiles
  refreshProfiles(): Promise<void>;
  createProfile(name: string, password?: string): Promise<ProfileSummary>;
  unlockCurrentProfile(id: string, password?: string): Promise<void>;
  lockProfile(): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  renameProfile(id: string, name: string): Promise<void>;
  changeProfilePassword(
    id: string,
    oldPassword: string | null,
    newPassword: string | null,
  ): Promise<void>;
  openAccountManager(): void;
  closeAccountManager(): void;

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

  // Overlay registry (ref-counted). Any component that needs to cover the
  // embedded WebContentsView calls pushOverlay() on mount and popOverlay()
  // on unmount; a single App-level effect suspends views while count > 0.
  pushOverlay(): void;
  popOverlay(): void;
}

const EMPTY_PROFILE_STATE: ProfileState = {
  activeInstanceId: null,
  instances: [],
  sidebarLayout: defaultLayout(),
};

const DEFAULT_APP_STATE: AppState = {
  themeId: 'nexus-dark',
  activeProfileId: null,
  notificationsEnabled: true,
  notificationSound: true,
  launchAtLogin: false,
  sidebarCompact: false,
};

const DEFAULT_STATE: CompositeState = {
  ...DEFAULT_APP_STATE,
  ...EMPTY_PROFILE_STATE,
};

/** Fetch both the global app state and the current profile's state, merged. */
async function refreshComposite(): Promise<CompositeState> {
  const [app, profile] = await Promise.all([
    window.nexus.getState(),
    window.nexus.getProfileState(),
  ]);
  const profileState = profile.state ?? EMPTY_PROFILE_STATE;
  return {
    ...app,
    ...profileState,
  } as CompositeState;
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
  overlayCount: 0,
  profiles: [],
  currentProfile: null,
  accountManagerOpen: false,

  async init() {
    try {
      const [modules, themes, composite, unread, profiles, currentProfile] =
        await Promise.all([
          window.nexus.listModules(),
          window.nexus.listThemes(),
          refreshComposite(),
          window.nexus.getAllUnread(),
          window.nexus.listProfiles(),
          window.nexus.currentProfile(),
        ]);
      set({
        modules,
        themes,
        state: composite,
        unread,
        profiles,
        currentProfile,
        // If no profile is unlocked, the AccountManager should appear so
        // the user can pick one (or enter a password).
        accountManagerOpen: currentProfile === null,
        ready: true,
        error: null,
      });

      window.nexus.onUnread((update) => {
        set((s) => ({ unread: { ...s.unread, [update.moduleId]: update.count } }));
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), ready: true });
    }
  },

  async activateInstance(instanceId) {
    await window.nexus.activateInstance(instanceId);
    const state = await refreshComposite();
    set({ state });
  },

  async addInstance(moduleId) {
    const instance = await window.nexus.addInstance(moduleId);
    const state = await refreshComposite();
    set({ state });
    return instance;
  },

  async removeInstance(instanceId) {
    await window.nexus.removeInstance(instanceId);
    const state = await refreshComposite();
    set((s) => {
      const unread = { ...s.unread };
      delete unread[instanceId];
      return { state, unread };
    });
  },

  async renameInstance(instanceId, name) {
    await window.nexus.renameInstance(instanceId, name);
    const state = await refreshComposite();
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

  async setNotificationsEnabled(enabled) {
    await window.nexus.setNotificationsEnabled(enabled);
    set((s) => ({ state: { ...s.state, notificationsEnabled: enabled } }));
  },

  async setNotificationSound(enabled) {
    await window.nexus.setNotificationSound(enabled);
    set((s) => ({ state: { ...s.state, notificationSound: enabled } }));
  },

  async setLaunchAtLogin(enabled) {
    await window.nexus.setLaunchAtLogin(enabled);
    set((s) => ({ state: { ...s.state, launchAtLogin: enabled } }));
  },

  async setSidebarCompact(enabled) {
    await window.nexus.setSidebarCompact(enabled);
    set((s) => ({ state: { ...s.state, sidebarCompact: enabled } }));
  },

  async testNotification() {
    return window.nexus.testNotification(null);
  },

  async exportThemePack(ids, meta) {
    const result = await window.nexus.exportThemePack(ids, meta);
    return result.canceled
      ? { canceled: true }
      : { canceled: false, path: result.path, count: result.count };
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
      const state = await refreshComposite();
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
      profiles: [],
      currentProfile: null,
      accountManagerOpen: true,
    });
  },

  // ─────────────────────────────────────────────────── profiles ──

  async refreshProfiles() {
    const [profiles, currentProfile] = await Promise.all([
      window.nexus.listProfiles(),
      window.nexus.currentProfile(),
    ]);
    set({ profiles, currentProfile });
  },

  async createProfile(name, password) {
    const p = await window.nexus.createProfile(name, password);
    await get().refreshProfiles();
    return p;
  },

  async unlockCurrentProfile(id, password) {
    await window.nexus.unlockProfile(id, password);
    // Pull everything fresh — the unlocked profile changes the instance list,
    // the sidebar layout, unread counts, and the current profile.
    const [state, unread, currentProfile, profiles] = await Promise.all([
      refreshComposite(),
      window.nexus.getAllUnread(),
      window.nexus.currentProfile(),
      window.nexus.listProfiles(),
    ]);
    set({
      state,
      unread,
      currentProfile,
      profiles,
      accountManagerOpen: false,
    });
  },

  async lockProfile() {
    await window.nexus.lockProfile();
    set({
      state: { ...DEFAULT_STATE, ...(get().state as AppState) }, // keep global prefs
      unread: {},
      currentProfile: null,
      accountManagerOpen: true,
    });
    // Re-fetch fully to reflect any changes that happened during this session.
    await get().refreshProfiles();
  },

  async deleteProfile(id) {
    await window.nexus.deleteProfile(id);
    await get().refreshProfiles();
    // If the deleted profile was active, the main process locked us.
    const current = get().currentProfile;
    if (!current) {
      set({
        state: { ...DEFAULT_STATE, ...(get().state as AppState) },
        unread: {},
        accountManagerOpen: true,
      });
    }
  },

  async renameProfile(id, name) {
    await window.nexus.renameProfile(id, name);
    await get().refreshProfiles();
  },

  async changeProfilePassword(id, oldPassword, newPassword) {
    await window.nexus.changeProfilePassword(id, oldPassword, newPassword);
    await get().refreshProfiles();
  },

  openAccountManager() {
    set({ accountManagerOpen: true });
  },

  closeAccountManager() {
    // Only allow closing when we have a current profile (otherwise the app
    // has nothing to show).
    if (get().currentProfile) set({ accountManagerOpen: false });
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

  pushOverlay() {
    set((s) => ({ overlayCount: s.overlayCount + 1 }));
  },

  popOverlay() {
    set((s) => ({ overlayCount: Math.max(0, s.overlayCount - 1) }));
  },
}));
