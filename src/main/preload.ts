import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  LoadedModule,
  Theme,
  AppState,
  UnreadUpdate,
  Bounds,
  SidebarLayout,
  ModuleInstance,
  ProfileSummary,
  PeekItem,
  VipEntry,
  HotkeyAction,
  EmailPeekConfig,
} from '../shared/types';

// Detect whether we're running inside an email-provider WebContentsView. When
// set, we skip exposing `window.nexus` (which would leak the full shell IPC
// surface into Gmail/Outlook) and instead boot the email overlay wiring
// described at the bottom of this file.
const EMAIL_PROVIDER_ARG_PREFIX = '--nexus-email-provider=';
const emailProviderArg = process.argv.find((a) => a.startsWith(EMAIL_PROVIDER_ARG_PREFIX));
const emailProvider = emailProviderArg
  ? (emailProviderArg.slice(EMAIL_PROVIDER_ARG_PREFIX.length) as 'gmail' | 'outlook')
  : null;

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
  platform: process.platform as NodeJS.Platform,
  listModules: (): Promise<LoadedModule[]> => invoke(IPC.MODULES_LIST),
  reloadModules: (): Promise<LoadedModule[]> => invoke(IPC.MODULES_RELOAD),
  openModulesDir: (): Promise<void> => invoke(IPC.MODULES_OPEN_DIR),

  addInstance: (moduleId: string): Promise<ModuleInstance> =>
    invoke(IPC.INSTANCES_ADD, moduleId),
  removeInstance: (instanceId: string): Promise<void> =>
    invoke(IPC.INSTANCES_REMOVE, instanceId),
  renameInstance: (instanceId: string, name: string): Promise<void> =>
    invoke(IPC.INSTANCES_RENAME, { id: instanceId, name }),
  activateInstance: (instanceId: string): Promise<void> =>
    invoke(IPC.INSTANCES_ACTIVATE, instanceId),
  reloadActiveInstance: (): Promise<void> => invoke(IPC.INSTANCES_RELOAD_ACTIVE),
  setInstanceMuted: (instanceId: string, muted: boolean): Promise<void> =>
    invoke(IPC.INSTANCES_SET_MUTED, { id: instanceId, muted }),

  listThemes: (): Promise<Theme[]> => invoke(IPC.THEMES_LIST),
  setTheme: (id: string): Promise<void> => invoke(IPC.THEMES_SET, id),
  saveTheme: (theme: Theme): Promise<Theme[]> => invoke(IPC.THEMES_SAVE, theme),
  deleteTheme: (id: string): Promise<Theme[]> => invoke(IPC.THEMES_DELETE, id),
  exportThemePack: (
    ids: string[],
    meta?: { name?: string; author?: string },
  ): Promise<{ canceled: true } | { canceled: false; path: string; count: number }> =>
    invoke(IPC.THEMES_EXPORT_PACK, { ids, ...meta }),
  importThemePack: (): Promise<
    { canceled: true } | { canceled: false; added: Theme[]; themes: Theme[] }
  > => invoke(IPC.THEMES_IMPORT_PACK),

  getState: (): Promise<AppState> => invoke(IPC.STATE_GET),
  setContentBounds: (bounds: Bounds): Promise<void> => invoke(IPC.LAYOUT_SET_BOUNDS, bounds),
  setViewsSuspended: (suspended: boolean): Promise<void> =>
    invoke(IPC.LAYOUT_SUSPEND, suspended),
  updateSidebarLayout: (layout: SidebarLayout): Promise<SidebarLayout> =>
    invoke(IPC.SIDEBAR_UPDATE_LAYOUT, layout),
  clearAllData: (): Promise<void> => invoke(IPC.APP_CLEAR_ALL_DATA),

  onUnread: (cb: (update: UnreadUpdate) => void): (() => void) => {
    const listener = (_: unknown, update: UnreadUpdate) => cb(update);
    ipcRenderer.on(IPC.UNREAD_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.UNREAD_UPDATE, listener);
  },
  onMenu: (cb: (event: string) => void): (() => void) => {
    const listener = (_: unknown, payload: { event: string }) => cb(payload.event);
    ipcRenderer.on('nexus:menu', listener);
    return () => ipcRenderer.removeListener('nexus:menu', listener);
  },
  getAllUnread: (): Promise<Record<string, number>> => invoke(IPC.UNREAD_ALL),
  setNotificationsEnabled: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_ENABLED, enabled),
  setNotificationSound: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_SOUND, enabled),
  setNotificationPrivacyMode: (enabled: boolean): Promise<void> =>
    invoke(IPC.NOTIFY_SET_PRIVACY, enabled),
  setDnd: (enabled: boolean, start: string, end: string): Promise<void> =>
    invoke(IPC.NOTIFY_SET_DND, { enabled, start, end }),
  setLaunchAtLogin: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_LAUNCH_AT_LOGIN, enabled),
  setSidebarCompact: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_SIDEBAR_COMPACT, enabled),
  setSidebarWidth: (width: number): Promise<void> =>
    invoke(IPC.PREFS_SET_SIDEBAR_WIDTH, width),
  setCloseToTray: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_CLOSE_TO_TRAY, enabled),
  setGlobalShortcutEnabled: (enabled: boolean): Promise<void> =>
    invoke(IPC.PREFS_SET_GLOBAL_SHORTCUT_ENABLED, enabled),
  setGlobalShortcut: (accelerator: string): Promise<void> =>
    invoke(IPC.PREFS_SET_GLOBAL_SHORTCUT, accelerator),
  testNotification: (instanceId?: string | null): Promise<boolean> =>
    invoke(IPC.NOTIFY_TEST, instanceId ?? null),

  // Profiles
  listProfiles: (): Promise<ProfileSummary[]> => invoke(IPC.PROFILES_LIST),
  currentProfile: (): Promise<ProfileSummary | null> => invoke(IPC.PROFILES_CURRENT),
  getProfileState: (): Promise<{
    current: ProfileSummary | null;
    state: {
      activeInstanceId: string | null;
      instances: ModuleInstance[];
      sidebarLayout?: SidebarLayout;
    } | null;
  }> => invoke(IPC.PROFILES_STATE),
  createProfile: (name: string, password?: string): Promise<ProfileSummary> =>
    invoke(IPC.PROFILES_CREATE, { name, password }),
  unlockProfile: (id: string, password?: string): Promise<ProfileSummary | null> =>
    invoke(IPC.PROFILES_UNLOCK, { id, password }),
  lockProfile: (): Promise<void> => invoke(IPC.PROFILES_LOCK),
  deleteProfile: (id: string): Promise<void> => invoke(IPC.PROFILES_DELETE, id),
  renameProfile: (id: string, name: string): Promise<void> =>
    invoke(IPC.PROFILES_RENAME, { id, name }),
  changeProfilePassword: (
    id: string,
    oldPassword: string | null,
    newPassword: string | null,
  ): Promise<void> =>
    invoke(IPC.PROFILES_CHANGE_PASSWORD, { id, oldPassword, newPassword }),

  // Updater
  checkForUpdates: (): Promise<unknown> => invoke(IPC.UPDATER_CHECK),
  downloadUpdate: (): Promise<unknown> => invoke(IPC.UPDATER_DOWNLOAD),
  installUpdate: (): Promise<void> => invoke(IPC.UPDATER_INSTALL),
  getUpdaterStatus: (): Promise<unknown> => invoke(IPC.UPDATER_STATUS),
  getAppVersion: (): Promise<{ version: string; isPackaged: boolean }> =>
    invoke(IPC.APP_VERSION),

  // Community modules
  listCommunityModules: (): Promise<{
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
  }> => invoke(IPC.COMMUNITY_MODULES_LIST),
  installCommunityModule: (moduleId: string, overwrite = false): Promise<void> =>
    invoke(IPC.COMMUNITY_MODULES_INSTALL, { moduleId, overwrite }),
  onUpdaterStatus: (cb: (status: unknown) => void): (() => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('nexus:updater:status', listener);
    return () => ipcRenderer.removeListener('nexus:updater:status', listener);
  },

  // Email mode
  email: {
    getPeek: (): Promise<Record<string, PeekItem[]>> => invoke(IPC.EMAIL_GET_PEEK),
    onPeekChanged: (
      cb: (data: { instanceId: string; items: PeekItem[] }) => void,
    ): (() => void) => {
      const listener = (_: unknown, payload: { instanceId: string; items: PeekItem[] }) =>
        cb(payload);
      ipcRenderer.on(IPC.EMAIL_PEEK_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.EMAIL_PEEK_CHANGED, listener);
    },
    listVips: (): Promise<VipEntry[]> => invoke(IPC.EMAIL_VIPS_LIST),
    addVip: (entry: VipEntry): Promise<VipEntry[]> => invoke(IPC.EMAIL_VIPS_ADD, entry),
    removeVip: (email: string): Promise<VipEntry[]> =>
      invoke(IPC.EMAIL_VIPS_REMOVE, { email }),
    setPeekConfig: (cfg: EmailPeekConfig): Promise<void> =>
      invoke(IPC.EMAIL_SET_PEEK_CONFIG, cfg),
  },

  // Hotkeys
  hotkeys: {
    list: (): Promise<HotkeyAction[]> => invoke(IPC.HOTKEYS_LIST),
    rebind: (
      actionId: string,
      binding: string | null,
    ): Promise<{ ok: true } | { ok: false; conflictingActionId: string }> =>
      invoke(IPC.HOTKEYS_REBIND, { actionId, binding }),
    reset: (actionId: string): Promise<void> => invoke(IPC.HOTKEYS_RESET, { actionId }),
  },
};

// Only expose the shell IPC surface on the Nexus window itself, not on
// email-provider WebContentsViews (Gmail/Outlook). The email bootstrap below
// handles the overlay wiring for those.
if (!emailProvider) {
  contextBridge.exposeInMainWorld('nexus', api);
}

export type NexusApi = typeof api;

// --- Email overlay bootstrap -------------------------------------------------
//
// Runs only when this preload is installed on an email-provider WebContentsView
// (as a session preload by ViewService). Gated on the `--nexus-email-provider=…`
// additionalArgument so it's a no-op in every other context. Uses CommonJS
// `require` because the main-process tsconfig compiles to CJS and the preload
// needs synchronous access to the overlay factories without pulling a bundler
// into the equation.
// Defense in depth: the Zod manifest validator should already prevent
// unknown providers, but reject here rather than silently fall into the
// Outlook branch of the bootstrap below.
if (emailProvider && emailProvider !== 'gmail' && emailProvider !== 'outlook') {
  throw new Error(`unknown email provider: ${emailProvider as string}`);
}

if (emailProvider) {
  // Dynamic require keeps these out of the shell bundle's cold path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createGmailOverlay } = require('./overlays/gmail') as typeof import('./overlays/gmail');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createOutlookOverlay } = require('./overlays/outlook') as typeof import('./overlays/outlook');

  const overlay =
    emailProvider === 'gmail' ? createGmailOverlay() : createOutlookOverlay();

  ipcRenderer.on(IPC.EMAIL_RUN_ACTION, (_evt, actionId: string) => {
    if (actionId === 'email.copyAsJson') {
      const data = overlay.extractFocusedEmail();
      ipcRenderer.send(IPC.EMAIL_COPY_JSON, data); // EmailData | null
    }
  });

  // Peek scraping: observer for immediate updates, 60s poll as a safety net in
  // case the observer misses a mutation, and a post-load priming nudge.
  let lastItems: string | null = null;
  const pushPeek = (): void => {
    const items: PeekItem[] = overlay.scrapeInboxPeek(20);
    const str = JSON.stringify(items);
    if (str === lastItems) return;
    lastItems = str;
    ipcRenderer.send(IPC.EMAIL_PEEK_UPDATE, items);
  };
  const disposeObserver = overlay.observeInbox(() => {
    pushPeek();
  });
  const pollId = setInterval(() => {
    pushPeek();
  }, 60_000);
  window.addEventListener('load', () => {
    setTimeout(() => {
      pushPeek();
    }, 2000);
  });

  // VIP context menu: overlay injects a right-click item on sender nodes; we
  // forward marks to the main process.
  const disposeMenu = overlay.injectVipContextMenu((email) => {
    ipcRenderer.send(IPC.EMAIL_VIPS_ADD, { email });
  });

  window.addEventListener('unload', () => {
    disposeObserver();
    disposeMenu();
    clearInterval(pollId);
  });
}
