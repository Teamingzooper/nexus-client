import { WebContentsView, session, type WebContents } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IPC } from '../../shared/types';
import type { Bounds, LoadedModule, ModuleInstance } from '../../shared/types';
import { partitionForInstance } from '../../shared/instance';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { ModuleRegistryService } from './moduleRegistryService';
import type { WindowService } from './windowService';
import type { ProfileService } from './profileService';
import type { HotkeyRegistryService } from './hotkeyRegistryService';
import type { SettingsService } from './settingsService';
import { DefaultStrategyFactory } from './notifications/strategies';
import type { NotificationStrategy, StrategyFactory } from './notifications/strategy';
import { mainWorldNotificationShim } from './notifications/mainWorldShim';
import { hardenSession, installNavigationGuard, resolveModuleFile } from '../core/security';
import type { EmailOverlay } from '../overlays/types';
import { createGmailOverlay } from '../overlays/gmail';
import { createOutlookOverlay } from '../overlays/outlook';

interface ManagedView {
  instanceId: string;
  moduleId: string;
  view: WebContentsView;
  strategy?: NotificationStrategy;
}

const HIDDEN: Bounds = { x: -10000, y: -10000, width: 0, height: 0 };

export class ViewService implements Service {
  readonly name = 'views';
  private logger!: Logger;
  private ctx!: ServiceContext;
  private registry!: ModuleRegistryService;
  private windowService!: WindowService;
  private profiles!: ProfileService;
  private views = new Map<string, ManagedView>();
  /**
   * For views backing an email-provider module, we keep a reference to the
   * overlay implementation so the main process has a way to reach it for
   * provider-scoped work (teardown bookkeeping, future IPC handlers). The
   * overlay methods themselves run inside the WebContentsView via the preload.
   */
  private overlays = new Map<string, EmailOverlay>();
  private activeId: string | null = null;
  private bounds: Bounds = { x: 220, y: 40, width: 800, height: 600 };
  private suspended = false;
  private strategyFactory: StrategyFactory = new DefaultStrategyFactory();

  async init(ctx: ServiceContext): Promise<void> {
    this.ctx = ctx;
    this.logger = ctx.logger.child('views');
    this.registry = ctx.container.get<ModuleRegistryService>('modules');
    this.windowService = ctx.container.get<WindowService>('window');
    this.profiles = ctx.container.get<ProfileService>('profiles');
  }

  async dispose(): Promise<void> {
    this.destroyAll();
  }

  /**
   * Destroy every currently-mounted view. Called on profile switch so the
   * outgoing profile's WebContentsViews stop writing to their partitions
   * before the new profile's views get created.
   */
  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroy(id);
  }

  /**
   * Look up which instance owns a given WebContents. Used by IpcService
   * to attribute fire-and-forget sends (peek updates, copy-as-json) from
   * email-provider views back to the correct instance id.
   */
  getInstanceIdForWebContents(wc: WebContents): string | null {
    for (const [id, mv] of this.views) {
      if (mv.view.webContents === wc) return id;
    }
    return null;
  }

  setBounds(bounds: Bounds): void {
    if (boundsEqual(this.bounds, bounds)) return;
    this.bounds = bounds;
    this.applyBounds();
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.ctx.bus.emit('view:suspended', { suspended });
    this.applyBounds();
  }

  private applyBounds(): void {
    if (!this.activeId) return;
    const mv = this.views.get(this.activeId);
    if (mv) mv.view.setBounds(this.suspended ? HIDDEN : this.bounds);
  }

  ensure(instanceId: string): ManagedView {
    const existing = this.views.get(instanceId);
    if (existing) return existing;

    const instance = this.profiles.getInstance(instanceId);
    if (!instance) throw new Error(`instance not found: ${instanceId}`);

    const mod = this.registry.get(instance.moduleId);
    if (!mod) throw new Error(`module not found for instance ${instanceId}: ${instance.moduleId}`);

    const mv = this.create(instance, mod);
    this.views.set(instanceId, mv);
    this.ctx.bus.emit('view:created', { instanceId });
    return mv;
  }

  activate(instanceId: string): void {
    const mv = this.ensure(instanceId);
    const win = this.windowService.getWindow();
    if (!win || win.isDestroyed()) return;

    // Detach all other views so only the active one is attached to contentView.
    for (const [id, other] of this.views) {
      if (id !== instanceId) {
        try {
          win.contentView.removeChildView(other.view);
        } catch {
          // not attached
        }
      }
    }

    try {
      win.contentView.addChildView(mv.view);
    } catch {
      // already attached
    }

    this.activeId = instanceId;
    mv.view.setBounds(this.suspended ? HIDDEN : this.bounds);
    this.ctx.bus.emit('instance:activated', { instanceId });
  }

  destroy(instanceId: string): void {
    const mv = this.views.get(instanceId);
    if (!mv) return;
    const win = this.windowService.getWindow();
    if (win && !win.isDestroyed()) {
      try {
        win.contentView.removeChildView(mv.view);
      } catch {
        // not attached
      }
    }
    mv.strategy?.detach();
    try {
      mv.view.webContents.close();
    } catch {
      // ignore
    }
    this.views.delete(instanceId);
    this.overlays.delete(instanceId);
    if (this.activeId === instanceId) this.activeId = null;
    this.ctx.bus.emit('view:destroyed', { instanceId });
  }

  /**
   * Purge all persisted data for an instance — cookies, localStorage, IndexedDB,
   * service workers, cache, everything. Safe to call on partitions that don't
   * exist yet (no-op). Used on remove (trash data) and on add (paranoid fresh
   * slate in case the partition id was reused from a previously deleted instance).
   */
  async clearInstanceData(instanceId: string): Promise<void> {
    // Look up the explicit partition from the instance if possible — new
    // profile-scoped instances have namespaced partitions that don't match
    // the default derivation. Falls back to the legacy form if the instance
    // isn't known (e.g. it was already removed from state before clear).
    const instance = this.profiles.getInstance(instanceId);
    const partition = instance?.partition ?? partitionForInstance(instanceId);
    try {
      const ses = session.fromPartition(partition);
      await ses.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      });
      await ses.clearCache();
      await ses.clearAuthCache();
      this.logger.info(`cleared data for instance ${instanceId}`);
    } catch (err) {
      this.logger.warn(`clearInstanceData failed for ${instanceId}`, err);
    }
  }

  /** Destroy every view and wipe every partition we know about. */
  async clearAllData(instanceIds: string[]): Promise<void> {
    for (const id of [...this.views.keys()]) this.destroy(id);
    await Promise.all(instanceIds.map((id) => this.clearInstanceData(id)));
  }

  reloadActive(): void {
    if (!this.activeId) return;
    const mv = this.views.get(this.activeId);
    if (mv) mv.view.webContents.reload();
  }

  /**
   * Resolves the effective email-mode provider for a manifest, honoring the
   * `features.emailMode` kill-switch in settings. Returns `undefined` when
   * the manifest doesn't declare an emailProvider OR when email mode is
   * disabled in settings. Downstream code can branch on this one value to
   * decide whether to run any overlay behaviour at all.
   */
  private effectiveEmailProvider(manifest: LoadedModule['manifest']): 'gmail' | 'outlook' | undefined {
    if (!manifest.emailProvider) return undefined;
    try {
      const settings = this.ctx.container.get<SettingsService>('settings');
      // Default to enabled; only disable when the flag is explicitly false.
      if (settings.state.features?.emailMode === false) return undefined;
    } catch {
      // SettingsService not registered (tests) — default to enabled.
    }
    return manifest.emailProvider;
  }

  private create(instance: ModuleInstance, mod: LoadedModule): ManagedView {
    const manifest = mod.manifest;
    const emailProvider = this.effectiveEmailProvider(manifest);
    // Prefer the instance's explicit partition (set by ProfileService when
    // creating profile-scoped instances). Fall back to the legacy unnamespaced
    // form for instances that predate profiles.
    const partition = instance.partition ?? partitionForInstance(instance.id);
    const ses = session.fromPartition(partition);

    const origin = new URL(manifest.url).origin;
    hardenSession(ses, origin, this.logger);

    // Install the Nexus notification preload on this session so window.Notification
    // calls from the page are forwarded to the main process. Must be set before
    // the first loadURL so the very first frame picks it up.
    const notifyPreloadPath = path.join(__dirname, '..', 'notifyPreload.js');
    const sessionPreloads = [...ses.getPreloads(), notifyPreloadPath];

    // Email-provider modules get the Nexus preload added as a session preload
    // so the `--nexus-email-provider=…` additionalArgument picks up the overlay
    // bootstrap at the bottom of preload.ts. The shell-API contextBridge block
    // there is itself guarded on the arg so it does not leak `window.nexus`
    // into Gmail/Outlook pages.
    if (emailProvider) {
      sessionPreloads.push(path.join(__dirname, '..', 'preload.js'));
    }
    ses.setPreloads(sessionPreloads);

    let preloadAbs: string | undefined;
    if (manifest.inject?.preload) {
      const p = resolveModuleFile(mod.path, manifest.inject.preload);
      if (p) preloadAbs = p;
      else this.logger.warn(`preload rejected for ${manifest.id}: escapes module dir`);
    }

    const additionalArguments = emailProvider
      ? [`--nexus-email-provider=${emailProvider}`]
      : [];

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        preload: preloadAbs,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: true,
        devTools: this.ctx.isDev,
        additionalArguments,
      },
    });

    // Overlay setup for email-provider modules. The factory itself is pure
    // (just returns method bag — no DOM access at construction time) so it's
    // safe to instantiate in the main process. Methods that query the DOM
    // only run inside the WebContentsView via preload.ts.
    if (emailProvider) {
      const overlay = emailProvider === 'gmail' ? createGmailOverlay() : createOutlookOverlay();
      this.overlays.set(instance.id, overlay);

      view.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.isAutoRepeat) return;
        const chord = chordFromInput(input);
        if (!chord) return;
        // Hotkey lookups are cheap (string compare over a handful of entries)
        // and done per-keystroke, so resolve lazily from the container each time.
        let actionId: string | null = null;
        try {
          const hotkeys = this.ctx.container.get<HotkeyRegistryService>('hotkeys');
          actionId = hotkeys.resolveChord(chord);
        } catch {
          // HotkeyRegistryService not registered — nothing to do.
          return;
        }
        if (!actionId) return;
        event.preventDefault();
        view.webContents.send(IPC.EMAIL_RUN_ACTION, actionId);
      });
    }

    if (manifest.userAgent) {
      view.webContents.setUserAgent(manifest.userAgent);
    }

    const extraOrigins = (manifest.allowedOrigins ?? []).map((u) => new URL(u).origin);
    installNavigationGuard(view.webContents, origin, this.logger, extraOrigins);

    const injectShim = async () => {
      // The shim patches window.Notification and
      // ServiceWorkerRegistration.prototype.showNotification. Each frame has
      // its own window, so we have to inject into every frame in the subtree
      // — Teams in particular embeds chat/activity/calls in iframes and
      // notifications originate from those subframes. Idempotent.
      try {
        await view.webContents.executeJavaScript(mainWorldNotificationShim, true);
      } catch (err) {
        this.logger.warn(`notification shim inject failed for ${instance.id}`, err);
      }
      try {
        const main = view.webContents.mainFrame;
        if (main) {
          for (const frame of main.framesInSubtree) {
            if (frame === main) continue;
            frame
              .executeJavaScript(mainWorldNotificationShim, true)
              .catch(() => {
                // Subframes can be cross-origin or already detached — the shim
                // is best-effort per-frame and shouldn't log on every miss.
              });
          }
        }
      } catch {
        // mainFrame may be unavailable on shutdown
      }
    };

    // Late-created subframes (Teams spawns iframes for chat/activity after the
    // initial load) won't hit the dom-ready handler above, so we catch each
    // frame as it finishes loading and install the shim there too.
    view.webContents.on('did-frame-finish-load', (_e, isMainFrame, frameProcessId, frameRoutingId) => {
      if (isMainFrame) return;
      try {
        const frame = view.webContents.mainFrame?.framesInSubtree.find(
          (f) => f.processId === frameProcessId && f.routingId === frameRoutingId,
        );
        frame?.executeJavaScript(mainWorldNotificationShim, true).catch(() => {});
      } catch {
        // frame vanished between the event and the lookup
      }
    });

    view.webContents.on('dom-ready', async () => {
      // 1. Inject the Nexus main-world Notification shim. Idempotent — safe to
      //    re-run on reload. Runs in every frame (see injectShim).
      await injectShim();

      // 2. Inject module-specific CSS if declared in the manifest.
      if (manifest.inject?.css) {
        const cssPath = resolveModuleFile(mod.path, manifest.inject.css);
        if (!cssPath) {
          this.logger.warn(`css rejected for ${manifest.id}: escapes module dir`);
          return;
        }
        try {
          const css = await fs.readFile(cssPath, 'utf8');
          await view.webContents.insertCSS(css);
        } catch (err) {
          this.logger.warn(`css inject failed for ${manifest.id}`, err);
        }
      }
      this.ctx.bus.emit('view:ready', { instanceId: instance.id });
    });

    // Listen for notification forwards from the preload and bubble them
    // through the event bus so NotificationService can present them natively.
    view.webContents.ipc.on('nexus:notify:show', (_event, raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const r = raw as { title?: unknown; body?: unknown; tag?: unknown };
      const title = typeof r.title === 'string' ? r.title : '';
      const body = typeof r.body === 'string' ? r.body : '';
      const tag = typeof r.tag === 'string' ? r.tag : undefined;
      if (!title && !body) return;
      this.logger.debug(`notify from ${instance.id}: ${title} / ${body}`);
      this.ctx.bus.emit('notification:native', {
        instanceId: instance.id,
        title,
        body,
        tag,
      });
    });

    view.webContents.on('did-fail-load', (_e, code, desc, url) => {
      if (code === -3) return; // aborted
      this.logger.warn(`load failed for ${instance.id}: ${desc} (${code}) ${url}`);
      this.ctx.bus.emit('view:load-failed', { instanceId: instance.id, error: desc });
    });

    const strategy = this.strategyFactory.create(
      manifest.notifications ?? { kind: 'title' },
    );
    const mv: ManagedView = {
      instanceId: instance.id,
      moduleId: instance.moduleId,
      view,
      strategy: strategy ?? undefined,
    };

    if (strategy) {
      strategy.attach({
        moduleId: instance.id, // pass instance id so notifications are keyed per-instance
        webContents: view.webContents,
        logger: this.logger,
        emit: (count, preview) => {
          this.ctx.bus.emit('notification:update', {
            moduleId: instance.id,
            count,
            preview,
          });
        },
      });
    }

    view.webContents.loadURL(manifest.url).catch((err) => {
      this.logger.error(`loadURL failed for ${instance.id}`, err);
    });

    return mv;
  }
}

function boundsEqual(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Translate an Electron `before-input-event` input into the Accelerator-style
 * chord string used by HotkeyRegistryService (e.g. "Ctrl+Shift+J"). Returns
 * null for plain printable characters (we don't want to intercept typing) and
 * for events we can't translate.
 */
function chordFromInput(input: Electron.Input): string | null {
  if (input.type !== 'keyDown') return null;
  const mods: string[] = [];
  if (input.control) mods.push('Ctrl');
  if (input.meta) mods.push('Cmd');
  if (input.alt) mods.push('Alt');
  if (input.shift) mods.push('Shift');
  const key = normalizeKey(input.key);
  if (!key) return null;
  // A bare printable key with no modifiers is normal typing — do not hijack.
  if (mods.length === 0 && key.length === 1) return null;
  return [...mods, key].join('+');
}

function normalizeKey(key: string): string | null {
  if (!key) return null;
  if (key.length === 1) return key.toUpperCase();
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    ' ': 'Space',
  };
  return map[key] ?? key;
}
