import { BrowserWindow, WebContentsView, session, shell } from 'electron';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ModuleRegistry } from './moduleRegistry';
import type { LoadedModule, UnreadUpdate, NotificationStrategy } from '../shared/types';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ALLOWED_PRELOAD_CHANNELS = new Set(['nexus:unread', 'nexus:title']);

export class ViewManager extends EventEmitter {
  private views = new Map<string, WebContentsView>();
  private activeId: string | null = null;
  private bounds: Bounds = { x: 72, y: 48, width: 800, height: 600 };
  private suspended = false;
  private readonly HIDDEN: Bounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private win: BrowserWindow,
    private registry: ModuleRegistry,
  ) {
    super();
    this.win.on('resize', () => this.applyBounds());
  }

  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
    this.applyBounds();
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.applyBounds();
  }

  private applyBounds(): void {
    if (!this.activeId) return;
    const view = this.views.get(this.activeId);
    if (view) view.setBounds(this.suspended ? this.HIDDEN : this.bounds);
  }

  ensureView(moduleId: string): WebContentsView {
    const existing = this.views.get(moduleId);
    if (existing) return existing;

    const mod = this.registry.get(moduleId);
    if (!mod) throw new Error(`module not found: ${moduleId}`);
    const view = this.createView(mod);
    this.views.set(moduleId, view);
    return view;
  }

  private createView(mod: LoadedModule): WebContentsView {
    const manifest = mod.manifest;
    const partition = manifest.partition ?? `persist:${manifest.id}`;
    const ses = session.fromPartition(partition);

    const preloadAbs =
      manifest.inject?.preload && path.join(mod.path, manifest.inject.preload);

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        preload: preloadAbs,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

    if (manifest.userAgent) {
      view.webContents.setUserAgent(manifest.userAgent);
    }

    view.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    view.webContents.on('dom-ready', async () => {
      if (manifest.inject?.css) {
        try {
          const css = await fs.readFile(path.join(mod.path, manifest.inject.css), 'utf8');
          await view.webContents.insertCSS(css);
        } catch (err) {
          console.warn(`[nexus] css inject failed for ${manifest.id}:`, err);
        }
      }
    });

    view.webContents.on('page-title-updated', (_e, title) => {
      this.maybeParseTitle(manifest.id, manifest.notifications, title);
    });

    view.webContents.ipc.on('nexus:unread', (_e, count: unknown, preview?: unknown) => {
      if (typeof count === 'number' && count >= 0) {
        this.emitUnread({
          moduleId: manifest.id,
          count: Math.floor(count),
          preview: typeof preview === 'string' ? preview : undefined,
        });
      }
    });

    view.webContents.ipc.on('nexus:title', (_e, title: unknown) => {
      if (typeof title === 'string') {
        this.maybeParseTitle(manifest.id, manifest.notifications, title);
      }
    });

    // Block any IPC channel not on the allowlist.
    view.webContents.on('ipc-message', (event, channel) => {
      if (!ALLOWED_PRELOAD_CHANNELS.has(channel)) {
        event.preventDefault?.();
      }
    });

    view.webContents.loadURL(manifest.url).catch((err) => {
      console.error(`[nexus] load failed for ${manifest.id}:`, err);
    });

    return view;
  }

  private maybeParseTitle(
    moduleId: string,
    strategy: NotificationStrategy | undefined,
    title: string,
  ): void {
    if (!strategy || strategy.kind !== 'title') return;
    const pattern = strategy.pattern ?? '\\((\\d+)\\)';
    try {
      const match = title.match(new RegExp(pattern));
      const count = match ? parseInt(match[1] ?? '0', 10) : 0;
      this.emitUnread({ moduleId, count: Number.isFinite(count) ? count : 0 });
    } catch {
      // ignore bad patterns
    }
  }

  private emitUnread(update: UnreadUpdate): void {
    this.emit('unread', update);
  }

  activate(moduleId: string): void {
    const view = this.ensureView(moduleId);

    for (const [id, v] of this.views) {
      if (id !== moduleId) {
        try {
          this.win.contentView.removeChildView(v);
        } catch {
          // not attached
        }
      }
    }

    try {
      this.win.contentView.addChildView(view);
    } catch {
      // already attached
    }
    this.activeId = moduleId;
    view.setBounds(this.suspended ? this.HIDDEN : this.bounds);
  }

  disable(moduleId: string): void {
    const view = this.views.get(moduleId);
    if (!view) return;
    try {
      this.win.contentView.removeChildView(view);
    } catch {
      // ignore
    }
    view.webContents.close();
    this.views.delete(moduleId);
    if (this.activeId === moduleId) this.activeId = null;
  }

  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.disable(id);
  }
}
