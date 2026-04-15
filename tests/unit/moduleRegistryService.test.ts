import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => ({
  shell: { openPath: vi.fn() },
}));

import { ModuleRegistryService } from '../../src/main/services/moduleRegistryService';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';
import { ServiceContainer } from '../../src/main/core/service';

async function setupTree(): Promise<{ userData: string; appPath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-modules-'));
  const userData = path.join(root, 'userData');
  const appPath = path.join(root, 'appPath');
  await fs.mkdir(userData, { recursive: true });
  await fs.mkdir(path.join(appPath, 'modules'), { recursive: true });
  return { userData, appPath };
}

async function writeModule(
  modulesDir: string,
  id: string,
  manifest: Record<string, unknown>,
  extraFiles: Record<string, string> = {},
): Promise<void> {
  const dir = path.join(modulesDir, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'nexus-module.json'),
    JSON.stringify(manifest),
    'utf8',
  );
  for (const [file, content] of Object.entries(extraFiles)) {
    await fs.writeFile(path.join(dir, file), content, 'utf8');
  }
}

function makeCtx(userData: string, appPath: string) {
  const bus = new EventBus();
  return {
    container: new ServiceContainer({
      logger: new Logger('test', 'error'),
      bus,
      userData,
      appPath,
      isDev: false,
    }),
    logger: new Logger('test', 'error'),
    bus,
    userData,
    appPath,
    isDev: false,
  };
}

describe('ModuleRegistryService', () => {
  let userData: string;
  let appPath: string;

  beforeEach(async () => {
    ({ userData, appPath } = await setupTree());
  });
  afterEach(async () => {
    await fs.rm(path.dirname(userData), { recursive: true, force: true });
  });

  const validManifest = {
    id: 'whatsapp',
    name: 'WhatsApp',
    version: '1.0.0',
    url: 'https://web.whatsapp.com',
  };

  it('loads a valid bundled module', async () => {
    await writeModule(path.join(appPath, 'modules'), 'whatsapp', validManifest);
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.list()).toHaveLength(1);
    expect(s.get('whatsapp')).toBeDefined();
  });

  it('ignores invalid manifests', async () => {
    await writeModule(path.join(appPath, 'modules'), 'bad', {
      id: 'bad',
      name: 'Bad',
      version: '1.0.0',
      url: 'http://insecure.example.com',
    });
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.list()).toHaveLength(0);
  });

  it('rejects modules whose preload escapes the module dir', async () => {
    await writeModule(
      path.join(appPath, 'modules'),
      'bad',
      { ...validManifest, id: 'bad', inject: { preload: '../escape.js' } },
    );
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.get('bad')).toBeUndefined();
  });

  it('rejects modules whose preload file is missing', async () => {
    await writeModule(path.join(appPath, 'modules'), 'missing', {
      ...validManifest,
      id: 'missing',
      inject: { preload: 'preload.js' },
    });
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.get('missing')).toBeUndefined();
  });

  it('loads a module with a valid preload', async () => {
    await writeModule(
      path.join(appPath, 'modules'),
      'ok',
      { ...validManifest, id: 'ok', inject: { preload: 'preload.js' } },
      { 'preload.js': '// stub' },
    );
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.get('ok')).toBeDefined();
  });

  it('user-dir modules override bundled ones with the same id', async () => {
    await writeModule(path.join(appPath, 'modules'), 'whatsapp', {
      ...validManifest,
      name: 'Bundled',
    });
    await fs.mkdir(path.join(userData, 'modules'), { recursive: true });
    await writeModule(path.join(userData, 'modules'), 'whatsapp', {
      ...validManifest,
      name: 'User',
    });
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.get('whatsapp')?.manifest.name).toBe('User');
  });

  it('reload() re-scans the filesystem', async () => {
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    expect(s.list()).toHaveLength(0);
    await writeModule(path.join(appPath, 'modules'), 'whatsapp', validManifest);
    await s.reload();
    expect(s.list()).toHaveLength(1);
  });

  it('emits modules:loaded after init', async () => {
    const ctx = makeCtx(userData, appPath);
    const handler = vi.fn();
    ctx.bus.on('modules:loaded', handler);
    const s = new ModuleRegistryService();
    await s.init(ctx);
    expect(handler).toHaveBeenCalled();
  });

  it('loads icons as data urls', async () => {
    await writeModule(
      path.join(appPath, 'modules'),
      'whatsapp',
      { ...validManifest, icon: 'icon.svg' },
      { 'icon.svg': '<svg></svg>' },
    );
    const s = new ModuleRegistryService();
    await s.init(makeCtx(userData, appPath));
    const mod = s.get('whatsapp');
    expect(mod?.iconDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});
