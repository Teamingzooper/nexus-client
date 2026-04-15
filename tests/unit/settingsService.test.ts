import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SettingsService } from '../../src/main/services/settingsService';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';
import { ServiceContainer } from '../../src/main/core/service';

async function mktmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'nexus-settings-'));
}

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

describe('SettingsService', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mktmp();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('starts with defaults when no file exists', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    expect(s.state.activeModuleId).toBeNull();
    expect(s.state.enabledModuleIds).toEqual([]);
    expect(s.state.themeId).toBe('nexus-dark');
    await s.dispose();
  });

  it('persists enableModule calls across instances', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    s1.enableModule('whatsapp');
    s1.enableModule('telegram');
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.enabledModuleIds).toEqual(['whatsapp', 'telegram']);
    await s2.dispose();
  });

  it('disableModule also clears activeModuleId if it matches', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.enableModule('whatsapp');
    s.setActive('whatsapp');
    s.disableModule('whatsapp');
    expect(s.state.activeModuleId).toBeNull();
    expect(s.state.enabledModuleIds).toEqual([]);
    await s.dispose();
  });

  it('enableModule is idempotent', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.enableModule('whatsapp');
    s.enableModule('whatsapp');
    expect(s.state.enabledModuleIds).toEqual(['whatsapp']);
    await s.dispose();
  });

  it('setWindowState persists and survives reload', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    s1.setWindowState({ x: 100, y: 200, width: 1400, height: 900, maximized: true });
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.windowState).toEqual({
      x: 100,
      y: 200,
      width: 1400,
      height: 900,
      maximized: true,
    });
    await s2.dispose();
  });

  it('recovers from corrupt state file', async () => {
    const file = path.join(tmp, 'nexus-state.json');
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(file, '{not json', 'utf8');
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    expect(s.state.themeId).toBe('nexus-dark');
    await s.dispose();
  });

  it('ignores schema-invalid state and reverts to defaults', async () => {
    const file = path.join(tmp, 'nexus-state.json');
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ enabledModuleIds: 'not-array' }), 'utf8');
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    expect(s.state.enabledModuleIds).toEqual([]);
    await s.dispose();
  });
});
