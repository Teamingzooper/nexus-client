import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { themeSchema, themePackSchema } from '../../shared/schemas';
import type { Theme, ThemePack } from '../../shared/types';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';

const DARK: Theme = {
  id: 'nexus-dark',
  name: 'Nexus Dark',
  colors: {
    bg: '#1a1b26',
    sidebar: '#16161e',
    sidebarHover: '#24263a',
    accent: '#7aa2f7',
    accentFg: '#0b0c10',
    text: '#c0caf5',
    textMuted: '#7982a9',
    border: '#2a2b3d',
    badge: '#f7768e',
    badgeFg: '#ffffff',
  },
};

const LIGHT: Theme = {
  id: 'nexus-light',
  name: 'Nexus Light',
  colors: {
    bg: '#f5f6fa',
    sidebar: '#ebeef5',
    sidebarHover: '#dce0ec',
    accent: '#2563eb',
    accentFg: '#ffffff',
    text: '#1e1f2b',
    textMuted: '#656a7d',
    border: '#cfd3e0',
    badge: '#e11d48',
    badgeFg: '#ffffff',
  },
};

const MIDNIGHT: Theme = {
  id: 'nexus-midnight',
  name: 'Nexus Midnight',
  colors: {
    bg: '#0b0e1a',
    sidebar: '#070911',
    sidebarHover: '#121726',
    accent: '#a78bfa',
    accentFg: '#0b0e1a',
    text: '#e6e8f0',
    textMuted: '#6b7088',
    border: '#1a1f35',
    badge: '#ec4899',
    badgeFg: '#ffffff',
  },
};

const BUILT_INS: Theme[] = [DARK, LIGHT, MIDNIGHT];
const BUILT_IN_IDS = new Set(BUILT_INS.map((t) => t.id));

export class ThemeService implements Service {
  readonly name = 'themes';
  private logger!: Logger;
  private file = '';
  private themes = new Map<string, Theme>();

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('themes');
    this.file = path.join(ctx.userData, 'nexus-themes.json');
    await this.load();
  }

  private async load(): Promise<void> {
    this.themes.clear();
    for (const t of BUILT_INS) this.themes.set(t.id, t);
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = z.array(themeSchema).safeParse(JSON.parse(raw));
      if (parsed.success) {
        for (const t of parsed.data) {
          if (!BUILT_IN_IDS.has(t.id)) this.themes.set(t.id, t);
        }
      } else {
        this.logger.warn('theme file invalid, ignoring', parsed.error.flatten());
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.warn('theme load error', err);
    }
  }

  list(): Theme[] {
    return [...this.themes.values()];
  }

  get(id: string): Theme | undefined {
    return this.themes.get(id);
  }

  isBuiltIn(id: string): boolean {
    return BUILT_IN_IDS.has(id);
  }

  async save(theme: Theme): Promise<Theme[]> {
    const parsed = themeSchema.parse(theme);
    if (BUILT_IN_IDS.has(parsed.id)) {
      throw new Error(`cannot overwrite built-in theme: ${parsed.id}`);
    }
    this.themes.set(parsed.id, parsed);
    await this.persistCustoms();
    return this.list();
  }

  async delete(id: string): Promise<Theme[]> {
    if (BUILT_IN_IDS.has(id)) throw new Error(`cannot delete built-in theme: ${id}`);
    this.themes.delete(id);
    await this.persistCustoms();
    return this.list();
  }

  private async persistCustoms(): Promise<void> {
    const customs = [...this.themes.values()].filter((t) => !BUILT_IN_IDS.has(t.id));
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(customs, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }

  /** Build a JSON pack from a list of theme ids. Unknown ids are skipped. */
  buildPack(ids: string[], meta?: { name?: string; author?: string }): ThemePack {
    const themes: Theme[] = [];
    for (const id of ids) {
      const t = this.themes.get(id);
      if (t) themes.push(t);
    }
    if (themes.length === 0) throw new Error('no valid themes to export');
    return {
      $schema: 'nexus-theme-pack',
      version: 1,
      name: meta?.name,
      author: meta?.author,
      themes,
    };
  }

  /**
   * Import a pack file and merge it into the custom themes.
   * Themes whose id collides with a built-in get a unique suffix; customs are
   * overwritten. Returns the list of themes actually added.
   */
  async importPack(rawJson: string): Promise<Theme[]> {
    const parsed = themePackSchema.parse(JSON.parse(rawJson));
    const added: Theme[] = [];
    for (const incoming of parsed.themes) {
      let target: Theme;
      if (BUILT_IN_IDS.has(incoming.id)) {
        // Rename to avoid overwriting a built-in.
        target = { ...incoming, id: this.makeUniqueId(incoming.id) };
      } else {
        target = incoming;
      }
      this.themes.set(target.id, target);
      added.push(target);
    }
    await this.persistCustoms();
    return added;
  }

  private makeUniqueId(base: string): string {
    let candidate = `${base}-imported`;
    let n = 1;
    while (this.themes.has(candidate) || BUILT_IN_IDS.has(candidate)) {
      n += 1;
      candidate = `${base}-imported-${n}`;
    }
    return candidate;
  }
}
