import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ThemeService } from '../../src/main/services/themeService';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';
import { ServiceContainer } from '../../src/main/core/service';
import type { Theme } from '../../src/shared/types';

function makeCtx(userData: string) {
  return {
    container: new ServiceContainer({
      logger: new Logger('test', 'error'),
      bus: new EventBus(),
      userData,
      appPath: userData,
      isDev: false,
    }),
    logger: new Logger('test', 'error'),
    bus: new EventBus(),
    userData,
    appPath: userData,
    isDev: false,
  };
}

const CUSTOM: Theme = {
  id: 'custom-one',
  name: 'Custom One',
  colors: {
    bg: '#000000',
    sidebar: '#111111',
    sidebarHover: '#222222',
    accent: '#3366ff',
    accentFg: '#ffffff',
    text: '#eeeeee',
    textMuted: '#999999',
    border: '#333333',
    badge: '#ff0000',
    badgeFg: '#ffffff',
  },
};

describe('ThemeService', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-theme-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('always lists built-in themes', async () => {
    const s = new ThemeService();
    await s.init(makeCtx(tmp));
    const ids = s.list().map((t) => t.id);
    expect(ids).toContain('nexus-dark');
    expect(ids).toContain('nexus-light');
    expect(ids).toContain('nexus-midnight');
  });

  it('save() persists customs and reload() sees them', async () => {
    const s1 = new ThemeService();
    await s1.init(makeCtx(tmp));
    await s1.save(CUSTOM);

    const s2 = new ThemeService();
    await s2.init(makeCtx(tmp));
    expect(s2.get('custom-one')).toEqual(CUSTOM);
  });

  it('refuses to overwrite built-ins', async () => {
    const s = new ThemeService();
    await s.init(makeCtx(tmp));
    await expect(s.save({ ...CUSTOM, id: 'nexus-dark' })).rejects.toThrow(/built-in/);
  });

  it('refuses to delete built-ins', async () => {
    const s = new ThemeService();
    await s.init(makeCtx(tmp));
    await expect(s.delete('nexus-dark')).rejects.toThrow(/built-in/);
  });

  it('delete() removes a custom and persists', async () => {
    const s1 = new ThemeService();
    await s1.init(makeCtx(tmp));
    await s1.save(CUSTOM);
    await s1.delete('custom-one');

    const s2 = new ThemeService();
    await s2.init(makeCtx(tmp));
    expect(s2.get('custom-one')).toBeUndefined();
  });

  it('rejects invalid colors', async () => {
    const s = new ThemeService();
    await s.init(makeCtx(tmp));
    const broken = { ...CUSTOM, colors: { ...CUSTOM.colors, bg: 'red' as any } };
    await expect(s.save(broken)).rejects.toThrow();
  });

  it('isBuiltIn() reports correctly', async () => {
    const s = new ThemeService();
    await s.init(makeCtx(tmp));
    expect(s.isBuiltIn('nexus-dark')).toBe(true);
    expect(s.isBuiltIn('custom-one')).toBe(false);
  });

  describe('theme pack', () => {
    it('buildPack collects requested themes', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      await s.save(CUSTOM);
      const pack = s.buildPack(['custom-one']);
      expect(pack.version).toBe(1);
      expect(pack.themes).toHaveLength(1);
      expect(pack.themes[0].id).toBe('custom-one');
    });

    it('buildPack silently drops unknown ids', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      const pack = s.buildPack(['nexus-dark', 'does-not-exist']);
      expect(pack.themes).toHaveLength(1);
      expect(pack.themes[0].id).toBe('nexus-dark');
    });

    it('buildPack throws when no valid themes', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      expect(() => s.buildPack(['does-not-exist'])).toThrow(/no valid themes/);
    });

    it('importPack merges custom themes by id', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      const pack = {
        $schema: 'nexus-theme-pack',
        version: 1,
        themes: [CUSTOM],
      };
      const added = await s.importPack(JSON.stringify(pack));
      expect(added).toHaveLength(1);
      expect(s.get('custom-one')).toEqual(CUSTOM);
    });

    it('importPack renames incoming themes that collide with built-ins', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      const pack = {
        $schema: 'nexus-theme-pack',
        version: 1,
        themes: [{ ...CUSTOM, id: 'nexus-dark', name: 'Hijacker' }],
      };
      const added = await s.importPack(JSON.stringify(pack));
      expect(added[0].id).not.toBe('nexus-dark');
      expect(added[0].id).toMatch(/^nexus-dark-imported/);
      // Built-in is untouched.
      expect(s.get('nexus-dark')?.name).toBe('Nexus Dark');
    });

    it('importPack rejects malformed JSON', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      await expect(s.importPack('{not json')).rejects.toThrow();
    });

    it('importPack rejects packs missing version', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      await expect(
        s.importPack(JSON.stringify({ themes: [CUSTOM] })),
      ).rejects.toThrow();
    });

    it('importPack rejects themes with invalid colors', async () => {
      const s = new ThemeService();
      await s.init(makeCtx(tmp));
      const bad = {
        version: 1,
        themes: [{ ...CUSTOM, colors: { ...CUSTOM.colors, bg: 'not-a-color' } }],
      };
      await expect(s.importPack(JSON.stringify(bad))).rejects.toThrow();
    });

    it('importPack persists to disk so subsequent instances see the new theme', async () => {
      const s1 = new ThemeService();
      await s1.init(makeCtx(tmp));
      await s1.importPack(
        JSON.stringify({ version: 1, themes: [CUSTOM] }),
      );

      const s2 = new ThemeService();
      await s2.init(makeCtx(tmp));
      expect(s2.get('custom-one')).toEqual(CUSTOM);
    });
  });
});
