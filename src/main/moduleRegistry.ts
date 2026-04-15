import { app, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import type { LoadedModule, ModuleManifest } from '../shared/types';

const notificationSchema = z.union([
  z.object({
    kind: z.literal('dom'),
    selector: z.string().min(1),
    parse: z.enum(['int', 'text']).optional(),
  }),
  z.object({
    kind: z.literal('title'),
    pattern: z.string().optional(),
  }),
  z.object({ kind: z.literal('custom') }),
  z.object({ kind: z.literal('none') }),
]);

const manifestSchema: z.ZodType<ModuleManifest> = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/),
  name: z.string().min(1),
  version: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url(),
  icon: z.string().optional(),
  partition: z.string().optional(),
  userAgent: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  inject: z
    .object({
      css: z.string().optional(),
      preload: z.string().optional(),
    })
    .optional(),
  notifications: notificationSchema.optional(),
});

const MANIFEST_NAME = 'nexus-module.json';

export class ModuleRegistry {
  private modules = new Map<string, LoadedModule>();

  get userDir(): string {
    return path.join(app.getPath('userData'), 'modules');
  }

  get bundledDir(): string {
    return path.join(app.getAppPath(), 'modules');
  }

  async load(): Promise<LoadedModule[]> {
    this.modules.clear();
    await fs.mkdir(this.userDir, { recursive: true });

    const sources = [this.bundledDir, this.userDir];
    for (const dir of sources) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const modulePath = path.join(dir, entry.name);
          const loaded = await this.loadOne(modulePath);
          if (loaded) this.modules.set(loaded.manifest.id, loaded);
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.warn(`[nexus] failed to scan ${dir}:`, err);
        }
      }
    }

    return this.list();
  }

  private async loadOne(modulePath: string): Promise<LoadedModule | null> {
    const manifestPath = path.join(modulePath, MANIFEST_NAME);
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const parsed = manifestSchema.parse(JSON.parse(raw));
      const loaded: LoadedModule = {
        manifest: { partition: `persist:${parsed.id}`, ...parsed },
        path: modulePath,
      };
      if (parsed.icon) {
        try {
          const iconPath = path.join(modulePath, parsed.icon);
          const buf = await fs.readFile(iconPath);
          const ext = path.extname(parsed.icon).slice(1).toLowerCase() || 'png';
          const mime =
            ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          loaded.iconDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        } catch {
          // icon optional
        }
      }
      return loaded;
    } catch (err) {
      console.warn(`[nexus] invalid module at ${modulePath}:`, err);
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
