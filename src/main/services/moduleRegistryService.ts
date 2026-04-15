import { shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { manifestSchema } from '../../shared/schemas';
import type { LoadedModule } from '../../shared/types';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import { resolveModuleFile } from '../core/security';

const MANIFEST_NAME = 'nexus-module.json';
const ICON_MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export class ModuleRegistryService implements Service {
  readonly name = 'modules';
  private logger!: Logger;
  private modules = new Map<string, LoadedModule>();
  private userDir = '';
  private bundledDir = '';
  private bus!: ServiceContext['bus'];

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('modules');
    this.bus = ctx.bus;
    this.userDir = path.join(ctx.userData, 'modules');
    this.bundledDir = path.join(ctx.appPath, 'modules');
    await fs.mkdir(this.userDir, { recursive: true });
    await this.load();
    this.bus.emit('modules:loaded', { count: this.modules.size });
  }

  async load(): Promise<LoadedModule[]> {
    this.modules.clear();
    for (const dir of [this.bundledDir, this.userDir]) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const modulePath = path.join(dir, entry.name);
          const loaded = await this.loadOne(modulePath);
          if (loaded) this.modules.set(loaded.manifest.id, loaded);
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') this.logger.warn(`scan failed: ${dir}`, err);
      }
    }
    this.logger.info(`loaded ${this.modules.size} module(s)`);
    return this.list();
  }

  async reload(): Promise<LoadedModule[]> {
    const list = await this.load();
    this.bus.emit('modules:reloaded', { count: list.length });
    return list;
  }

  private async loadOne(modulePath: string): Promise<LoadedModule | null> {
    const manifestPath = path.join(modulePath, MANIFEST_NAME);
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const parsed = manifestSchema.parse(JSON.parse(raw));

      // Validate inject paths are inside the module dir.
      if (parsed.inject?.css) {
        const resolved = resolveModuleFile(modulePath, parsed.inject.css);
        if (!resolved) throw new Error(`inject.css escapes module dir: ${parsed.inject.css}`);
        await fs.access(resolved);
      }
      if (parsed.inject?.preload) {
        const resolved = resolveModuleFile(modulePath, parsed.inject.preload);
        if (!resolved) throw new Error(`inject.preload escapes module dir: ${parsed.inject.preload}`);
        await fs.access(resolved);
      }

      const loaded: LoadedModule = {
        manifest: { partition: `persist:${parsed.id}`, ...parsed },
        path: modulePath,
      };

      if (parsed.icon) {
        const iconPath = resolveModuleFile(modulePath, parsed.icon);
        if (iconPath) {
          try {
            const buf = await fs.readFile(iconPath);
            const ext = path.extname(parsed.icon).slice(1).toLowerCase();
            const mime = ICON_MIME[ext] ?? 'image/png';
            loaded.iconDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          } catch {
            // icon missing — that's fine
          }
        }
      }
      return loaded;
    } catch (err) {
      this.logger.warn(`invalid module at ${modulePath}`, err);
      return null;
    }
  }

  get(id: string): LoadedModule | undefined {
    return this.modules.get(id);
  }

  list(): LoadedModule[] {
    return [...this.modules.values()].sort((a, b) =>
      a.manifest.name.localeCompare(b.manifest.name),
    );
  }

  async openUserDir(): Promise<void> {
    await fs.mkdir(this.userDir, { recursive: true });
    await shell.openPath(this.userDir);
  }
}
