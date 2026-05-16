import { WebContentsView, session } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Bounds, LoadedModule, ModuleInstance } from '../../shared/types';
import { partitionForInstance } from '../../shared/instance';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { ModuleRegistryService } from './moduleRegistryService';
import type { WindowService } from './windowService';
import type { SettingsService } from './settingsService';
import type { ProfileService } from './profileService';
import { DefaultStrategyFactory } from './notifications/strategies';
import type { NotificationStrategy, StrategyFactory } from './notifications/strategy';
import { mainWorldNotificationShim } from './notifications/mainWorldShim';
import { hardenSession, installNavigationGuard, resolveModuleFile } from '../core/security';

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
  private activeId: string | null = null;
  private bounds: Bounds = { x: 220, y: 40, width: 800, height: 600 };
  private suspended = false;
  private strategyFactory: StrategyFactory = new DefaultStrategyFactory();
  /** Wall-clock ms of last `activate(id)` per instance — used by the
   *  hibernation timer to find idle views. Not persisted; resets per
   *  Nexus session. Each entry seeds to `Date.now()` when the view is
   *  first ensured, so a freshly created instance has a "young" age. */
  private lastActiveAt = new Map<string, number>();
  /** Set of instance ids whose WebContentsView has been destroyed by the
   *  hibernation timer. ensure() consults this to know whether to emit
   *  `instance:woken` (rather than just `view:created`) on recreation. */
  private hibernatedIds = new Set<string>();
  private hibernateTimer: NodeJS.Timeout | null = null;

  async init(ctx: ServiceContext): Promise<void> {
    this.ctx = ctx;
    this.logger = ctx.logger.child('views');
    this.registry = ctx.container.get<ModuleRegistryService>('modules');
    this.windowService = ctx.container.get<WindowService>('window');
    this.profiles = ctx.container.get<ProfileService>('profiles');

    // Check every 60s for views that have been idle longer than the
    // configured threshold and hibernate them. Cheap operation — usually
    // a no-op since most users have few instances and short sessions.
    this.hibernateTimer = setInterval(() => {
      this.runHibernationSweep();
    }, 60_000);
  }

  async dispose(): Promise<void> {
    if (this.hibernateTimer) {
      clearInterval(this.hibernateTimer);
      this.hibernateTimer = null;
    }
    this.destroyAll();
  }

  /**
   * Destroy WebContentsViews for any non-active instance whose last activation
   * is older than `settings.hibernateAfterMinutes`. No-op when the feature
   * is disabled or no instances qualify. Emits `instance:hibernated` per
   * hibernated id so the renderer can mark them with a sleep indicator.
   */
  private runHibernationSweep(): void {
    let settings: SettingsService | null = null;
    try {
      settings = this.ctx.container.get<SettingsService>('settings');
    } catch {
      return; // SettingsService not registered (tests)
    }
    const minutes = settings?.state.hibernateAfterMinutes;
    if (!minutes || minutes <= 0) return;
    const threshold = Date.now() - minutes * 60_000;
    for (const [id, mv] of this.views) {
      if (id === this.activeId) continue;
      const last = this.lastActiveAt.get(id) ?? 0;
      if (last > threshold) continue;
      this.logger.info(`hibernating idle instance ${id} (last active ${new Date(last).toISOString()})`);
      // Tear down the view but DON'T forget about the instance — we want
      // ensure() to know it was hibernated so it can emit `instance:woken`.
      try {
        const win = this.windowService.getWindow();
        if (win && !win.isDestroyed()) {
          try {
            win.contentView.removeChildView(mv.view);
          } catch {
            /* not attached */
          }
        }
        mv.strategy?.detach();
        try {
          mv.view.webContents.close();
        } catch {
          /* already closed */
        }
      } finally {
        this.views.delete(id);
        this.lastActiveAt.delete(id);
        this.hibernatedIds.add(id);
        this.ctx.bus.emit('instance:hibernated', { instanceId: id });
      }
    }
  }

  /**
   * Destroy every currently-mounted view. Called on profile switch so the
   * outgoing profile's WebContentsViews stop writing to their partitions
   * before the new profile's views get created.
   */
  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroy(id);
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

    const wasHibernated = this.hibernatedIds.has(instanceId);
    const mv = this.create(instance, mod);
    this.views.set(instanceId, mv);
    // Seed last-active time so a freshly-ensured-but-not-yet-activated view
    // doesn't immediately qualify for hibernation in the same tick.
    this.lastActiveAt.set(instanceId, Date.now());
    if (wasHibernated) {
      this.hibernatedIds.delete(instanceId);
      this.ctx.bus.emit('instance:woken', { instanceId });
    }
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
    this.lastActiveAt.set(instanceId, Date.now());
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
    this.lastActiveAt.delete(instanceId);
    this.hibernatedIds.delete(instanceId);
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

  private create(instance: ModuleInstance, mod: LoadedModule): ManagedView {
    const manifest = mod.manifest;
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
    ses.setPreloads([...ses.getPreloads(), notifyPreloadPath]);

    let preloadAbs: string | undefined;
    if (manifest.inject?.preload) {
      const p = resolveModuleFile(mod.path, manifest.inject.preload);
      if (p) preloadAbs = p;
      else this.logger.warn(`preload rejected for ${manifest.id}: escapes module dir`);
    }

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
      },
    });

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

    // Renderer-process crash detection. Fires when the embedded web page's
    // renderer process exits abnormally (OOM kill, segfault in V8, the page
    // calling process.crash(), etc.). Without this hook the user just sees
    // a frozen webview; with it, the renderer's CrashOverlay shows over the
    // content area with a Reload button.
    view.webContents.on('render-process-gone', (_e, details) => {
      // `clean-exit` is a normal teardown (e.g. on view.webContents.close()).
      // Only flag the abnormal exits.
      if (details.reason === 'clean-exit') return;
      this.logger.warn(
        `renderer for ${instance.id} died: ${details.reason} (exitCode ${details.exitCode})`,
      );
      this.ctx.bus.emit('view:crashed', {
        instanceId: instance.id,
        reason: details.reason,
      });
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
