import { shell } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import {
  parseHeader,
  matchesUrl,
  type Userscript,
  type UserscriptSummary,
  type UserscriptType,
  type RunAt,
} from '../../shared/userscripts';

const STATE_FILE = 'userscripts-state.json';
const USERSCRIPT_EXT_RE = /\.user\.(js|css)$/i;

interface PersistedState {
  disabled: string[];
}

export class UserscriptService implements Service {
  readonly name = 'userscripts';
  private logger!: Logger;
  private dir = '';
  private stateFile = '';
  private scripts = new Map<string, Userscript>();
  private disabled = new Set<string>();
  private bus!: ServiceContext['bus'];
  private watcher?: fsSync.FSWatcher;
  private rescanTimer: NodeJS.Timeout | null = null;

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('userscripts');
    this.bus = ctx.bus;
    this.dir = path.join(ctx.userData, 'userscripts');
    this.stateFile = path.join(ctx.userData, STATE_FILE);
    await fs.mkdir(this.dir, { recursive: true });
    await this.loadState();
    await this.scan();
    this.startWatcher();
  }

  async dispose(): Promise<void> {
    this.watcher?.close();
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
  }

  private async loadState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      this.disabled = new Set(Array.isArray(parsed.disabled) ? parsed.disabled : []);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.warn('state load failed', err);
    }
  }

  private async saveState(): Promise<void> {
    const data: PersistedState = { disabled: [...this.disabled] };
    await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2), 'utf8');
  }

  private startWatcher(): void {
    try {
      this.watcher = fsSync.watch(this.dir, { persistent: false }, () => {
        // Debounce — a single save often fires multiple events.
        if (this.rescanTimer) clearTimeout(this.rescanTimer);
        this.rescanTimer = setTimeout(() => {
          this.rescanTimer = null;
          this.scan()
            .then(() => this.bus.emit('userscripts:changed', {}))
            .catch((err) => this.logger.warn('rescan failed', err));
        }, 150);
      });
    } catch (err) {
      this.logger.warn('watcher failed to start', err);
    }
  }

  async scan(): Promise<UserscriptSummary[]> {
    this.scripts.clear();
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.dir);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.warn(`scan failed: ${this.dir}`, err);
    }
    for (const name of entries) {
      if (!USERSCRIPT_EXT_RE.test(name)) continue;
      // Block paths that escape the dir — the regex already forbids slashes, but
      // re-resolve and compare to be safe.
      const full = path.join(this.dir, name);
      if (path.dirname(full) !== this.dir) continue;
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        const source = await fs.readFile(full, 'utf8');
        const type: UserscriptType = name.toLowerCase().endsWith('.css') ? 'css' : 'js';
        const meta = parseHeader(source, type, name);
        this.scripts.set(name, {
          filename: name,
          type,
          meta,
          source,
          enabled: !this.disabled.has(name),
        });
      } catch (err) {
        this.logger.warn(`load ${name} failed`, err);
        this.scripts.set(name, {
          filename: name,
          type: name.toLowerCase().endsWith('.css') ? 'css' : 'js',
          meta: { name, matches: [], runAt: 'document-end' },
          source: '',
          enabled: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return this.list();
  }

  list(): UserscriptSummary[] {
    return [...this.scripts.values()]
      .map(({ source: _source, ...rest }) => rest)
      .sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  }

  get(filename: string): Userscript | undefined {
    return this.scripts.get(filename);
  }

  /** Return enabled scripts that match the given module + url. */
  scriptsFor(moduleId: string, url: string, type: UserscriptType): Userscript[] {
    return [...this.scripts.values()].filter((s) => {
      if (s.type !== type) return false;
      if (!s.enabled) return false;
      if (s.error) return false;
      if (s.meta.moduleId && s.meta.moduleId !== moduleId) return false;
      if (s.meta.matches.length === 0) {
        // If no module is named and no matches — don't run (too broad).
        return !!s.meta.moduleId;
      }
      return s.meta.matches.some((p) => matchesUrl(p, url));
    });
  }

  async save(filename: string, source: string): Promise<Userscript> {
    const full = path.join(this.dir, filename);
    if (path.dirname(full) !== this.dir) {
      throw new Error('filename escapes userscripts dir');
    }
    await fs.writeFile(full, source, 'utf8');
    // Re-scan immediately for a deterministic response (don't wait for watcher).
    await this.scan();
    this.bus.emit('userscripts:changed', {});
    const saved = this.scripts.get(filename);
    if (!saved) throw new Error('save succeeded but script not visible after rescan');
    return saved;
  }

  async delete(filename: string): Promise<void> {
    const full = path.join(this.dir, filename);
    if (path.dirname(full) !== this.dir) {
      throw new Error('filename escapes userscripts dir');
    }
    try {
      await fs.unlink(full);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
    this.scripts.delete(filename);
    this.disabled.delete(filename);
    await this.saveState();
    this.bus.emit('userscripts:changed', {});
  }

  async rename(from: string, to: string): Promise<Userscript> {
    if (from === to) {
      const s = this.scripts.get(from);
      if (!s) throw new Error(`unknown userscript: ${from}`);
      return s;
    }
    // Extensions must match — a .user.js can't become a .user.css, the file
    // contents wouldn't parse.
    const fromExt = from.toLowerCase().endsWith('.user.css') ? 'css' : 'js';
    const toExt = to.toLowerCase().endsWith('.user.css') ? 'css' : 'js';
    if (fromExt !== toExt) throw new Error('cannot change extension when renaming');

    const fromPath = path.join(this.dir, from);
    const toPath = path.join(this.dir, to);
    if (path.dirname(fromPath) !== this.dir || path.dirname(toPath) !== this.dir) {
      throw new Error('filename escapes userscripts dir');
    }
    // Refuse to overwrite an existing file.
    try {
      await fs.access(toPath);
      throw new Error(`a userscript named "${to}" already exists`);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
    await fs.rename(fromPath, toPath);
    // Carry over enabled/disabled state.
    if (this.disabled.has(from)) {
      this.disabled.delete(from);
      this.disabled.add(to);
      await this.saveState();
    }
    await this.scan();
    this.bus.emit('userscripts:changed', {});
    const renamed = this.scripts.get(to);
    if (!renamed) throw new Error('rename succeeded but script not visible after rescan');
    return renamed;
  }

  async duplicate(filename: string): Promise<Userscript> {
    const s = this.scripts.get(filename);
    if (!s) throw new Error(`unknown userscript: ${filename}`);
    // Walk "name.user.js" → "name-copy.user.js" → "name-copy-2.user.js" …
    const extMatch = filename.match(/\.user\.(js|css)$/i);
    if (!extMatch) throw new Error('bad filename');
    const ext = extMatch[0];
    const base = filename.slice(0, -ext.length);
    let candidate = `${base}-copy${ext}`;
    let n = 2;
    while (this.scripts.has(candidate)) {
      candidate = `${base}-copy-${n}${ext}`;
      n++;
    }
    return this.save(candidate, s.source);
  }

  async setEnabled(filename: string, enabled: boolean): Promise<Userscript | undefined> {
    if (!this.scripts.has(filename)) throw new Error(`unknown userscript: ${filename}`);
    if (enabled) this.disabled.delete(filename);
    else this.disabled.add(filename);
    await this.saveState();
    const s = this.scripts.get(filename);
    if (s) s.enabled = enabled;
    this.bus.emit('userscripts:changed', {});
    return s;
  }

  async openDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await shell.openPath(this.dir);
  }
}

export type { RunAt };
