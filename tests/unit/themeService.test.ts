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
});
