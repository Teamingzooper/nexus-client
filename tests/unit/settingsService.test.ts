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
    expect(s.state.activeInstanceId).toBeNull();
    expect(s.state.instances).toEqual([]);
    expect(s.state.themeId).toBe('nexus-dark');
    await s.dispose();
  });

  it('addInstance creates an instance with module id when first of its kind', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    const inst = s.addInstance('whatsapp', 'WhatsApp');
    expect(inst.id).toBe('whatsapp');
    expect(inst.moduleId).toBe('whatsapp');
    expect(inst.name).toBe('WhatsApp');
    expect(s.state.instances).toHaveLength(1);
    await s.dispose();
  });

  it('addInstance twice gives unique ids and unique default names', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    const a = s.addInstance('whatsapp', 'WhatsApp');
    const b = s.addInstance('whatsapp', 'WhatsApp');
    expect(a.id).toBe('whatsapp');
    expect(b.id).toBe('whatsapp-2');
    expect(a.name).toBe('WhatsApp');
    expect(b.name).toBe('WhatsApp 2');
    await s.dispose();
  });

  it('removeInstance drops the instance and clears active if matching', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.addInstance('whatsapp', 'WhatsApp');
    s.setActive('whatsapp');
    s.removeInstance('whatsapp');
    expect(s.state.activeInstanceId).toBeNull();
    expect(s.state.instances).toEqual([]);
    await s.dispose();
  });

  it('renameInstance updates the name', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.addInstance('whatsapp', 'WhatsApp');
    s.renameInstance('whatsapp', 'Work');
    expect(s.state.instances[0].name).toBe('Work');
    await s.dispose();
  });

  it('renameInstance ignores blank names', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.addInstance('whatsapp', 'WhatsApp');
    s.renameInstance('whatsapp', '   ');
    expect(s.state.instances[0].name).toBe('WhatsApp');
    await s.dispose();
  });

  it('persists instances across reload', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    s1.addInstance('whatsapp', 'WhatsApp');
    s1.addInstance('whatsapp', 'WhatsApp');
    s1.renameInstance('whatsapp-2', 'Work');
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.instances.map((i) => i.id)).toEqual(['whatsapp', 'whatsapp-2']);
    expect(s2.state.instances[1].name).toBe('Work');
    await s2.dispose();
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
    await fs.writeFile(file, JSON.stringify({ instances: 'not-array' }), 'utf8');
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    expect(s.state.instances).toEqual([]);
    await s.dispose();
  });

  describe('legacy state migration', () => {
    it('migrates enabledModuleIds → instances on load', async () => {
      const file = path.join(tmp, 'nexus-state.json');
      await fs.mkdir(tmp, { recursive: true });
      await fs.writeFile(
        file,
        JSON.stringify({
          activeModuleId: 'whatsapp',
          enabledModuleIds: ['whatsapp', 'telegram'],
          themeId: 'nexus-dark',
        }),
        'utf8',
      );
      const s = new SettingsService();
      await s.init(makeCtx(tmp));
      expect(s.state.instances.map((i) => i.id)).toEqual(['whatsapp', 'telegram']);
      expect(s.state.activeInstanceId).toBe('whatsapp');
      await s.dispose();
    });

    it('migrates sidebarLayout moduleIds → entryIds on load', async () => {
      const file = path.join(tmp, 'nexus-state.json');
      await fs.mkdir(tmp, { recursive: true });
      await fs.writeFile(
        file,
        JSON.stringify({
          activeModuleId: null,
          enabledModuleIds: ['whatsapp'],
          themeId: 'nexus-dark',
          sidebarLayout: {
            groups: [{ id: 'main', name: 'Modules', moduleIds: ['whatsapp'] }],
          },
        }),
        'utf8',
      );
      const s = new SettingsService();
      await s.init(makeCtx(tmp));
      expect(s.state.sidebarLayout?.groups[0].entryIds).toEqual(['whatsapp']);
      await s.dispose();
    });
  });

  it('sidebar layout auto-reconciles when a new instance is added', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.addInstance('whatsapp', 'WhatsApp');
    expect(s.state.sidebarLayout?.groups[0].entryIds).toEqual(['whatsapp']);
    s.addInstance('whatsapp', 'WhatsApp');
    expect(s.state.sidebarLayout?.groups[0].entryIds).toEqual(['whatsapp', 'whatsapp-2']);
    await s.dispose();
  });
});
