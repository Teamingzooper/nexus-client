import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Theme } from '../shared/types';

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

const BUILT_INS: Theme[] = [DARK, LIGHT];

export class ThemeStore {
  private themes = new Map<string, Theme>();

  private get file(): string {
    return path.join(app.getPath('userData'), 'nexus-themes.json');
  }

  async load(): Promise<void> {
    this.themes.clear();
    for (const t of BUILT_INS) this.themes.set(t.id, t);
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const custom: Theme[] = JSON.parse(raw);
      for (const t of custom) this.themes.set(t.id, t);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn('[nexus] themes load failed:', err);
      }
    }
  }

  list(): Theme[] {
    return [...this.themes.values()];
  }

  get(id: string): Theme | undefined {
    return this.themes.get(id);
  }

  async save(theme: Theme): Promise<Theme[]> {
    this.themes.set(theme.id, theme);
    const custom = [...this.themes.values()].filter(
      (t) => !BUILT_INS.find((b) => b.id === t.id),
    );
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(custom, null, 2), 'utf8');
    return this.list();
  }
}
