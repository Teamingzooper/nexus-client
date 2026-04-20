import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { ModuleRegistryService } from './moduleRegistryService';

/**
 * Fetches the list of community-maintained modules published on the
 * `community-v*` GitHub releases and installs them into the user's modules
 * folder on request.
 *
 * GitHub API shape (what we use):
 *   GET /repos/{owner}/{repo}/releases
 *     -> [{ tag_name, name, assets: [{ name, browser_download_url }], ... }]
 *
 * We pick the most recent release whose tag matches `^community-v`. Its
 * assets include one `<moduleId>.zip` per module and an `index.json`
 * manifest (produced by scripts/pack-community-modules.js). The manifest
 * is what the renderer displays; the zips are what we download and extract
 * when the user clicks install.
 */

const REPO_OWNER = 'Teamingzooper';
const REPO_NAME = 'nexus-client';
const COMMUNITY_TAG_PREFIX = 'community-v';

const indexEntrySchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/),
  name: z.string().min(1).max(64),
  version: z.string().min(1).max(32),
  author: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  url: z.string().url(),
  zip: z.string().min(1).max(256),
});

const indexSchema = z.object({
  version: z.literal(1),
  modules: z.array(indexEntrySchema),
});

export type CommunityEntry = z.infer<typeof indexEntrySchema>;

export interface CommunityListing {
  tag: string;
  name: string;
  modules: CommunityEntry[];
}

interface CachedRelease {
  tag: string;
  name: string;
  assets: Map<string, string>; // asset name → download URL
  fetchedAt: number;
}

const RELEASE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class CommunityModulesService implements Service {
  readonly name = 'community-modules';
  private logger!: Logger;
  private userDir = '';
  private registry!: ModuleRegistryService;
  private cache: CachedRelease | null = null;

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('community-modules');
    this.userDir = path.join(ctx.userData, 'modules');
    this.registry = ctx.container.get<ModuleRegistryService>('modules');
  }

  async list(): Promise<CommunityListing> {
    const release = await this.loadRelease();
    const indexUrl = release.assets.get('index.json');
    if (!indexUrl) {
      throw new Error(
        `community release ${release.tag} is missing index.json — nothing to list`,
      );
    }
    const body = await httpGetJson(indexUrl);
    const parsed = indexSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(`community index.json failed validation: ${parsed.error.message}`);
    }
    return {
      tag: release.tag,
      name: release.name,
      modules: parsed.data.modules,
    };
  }

  /**
   * Downloads <moduleId>.zip from the latest community release and extracts
   * it into the user modules folder. Refuses to overwrite an existing
   * module with the same id unless `overwrite` is true. Returns the
   * extracted module folder's absolute path.
   */
  async install(moduleId: string, overwrite = false): Promise<string> {
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(moduleId) || moduleId.length > 64) {
      throw new Error(`invalid moduleId: ${moduleId}`);
    }
    const release = await this.loadRelease();
    const zipUrl = release.assets.get(`${moduleId}.zip`);
    if (!zipUrl) {
      throw new Error(`module "${moduleId}" not found in community release ${release.tag}`);
    }

    const targetDir = path.join(this.userDir, moduleId);
    const exists = await fs
      .access(targetDir)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      if (!overwrite) {
        throw new Error(
          `module "${moduleId}" is already installed. Remove it first or pass overwrite=true to replace.`,
        );
      }
      // Replace: wipe the target folder before extracting so orphaned files
      // from the previous version don't linger.
      await fs.rm(targetDir, { recursive: true, force: true });
    }

    await fs.mkdir(this.userDir, { recursive: true });

    const tmpZip = path.join(
      os.tmpdir(),
      `nexus-community-${moduleId}-${Date.now()}.zip`,
    );
    await downloadToFile(zipUrl, tmpZip);

    try {
      // extract-zip is a CommonJS module (via electron's extract-zip dep).
      // Require-dynamic so the main-process build can bundle it normally.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const extract = require('extract-zip') as (
        src: string,
        opts: { dir: string },
      ) => Promise<void>;
      // The zip's top-level directory is the module folder itself (produced
      // by pack-community-modules.js), so we extract into userDir and the
      // folder lands at userDir/<moduleId>/.
      await extract(tmpZip, { dir: this.userDir });
    } finally {
      fs.unlink(tmpZip).catch(() => {});
    }

    // Confirm the expected folder actually exists after extraction. If the
    // zip was malformed (no top-level <moduleId>/ folder) this catches it
    // before we tell the renderer it worked.
    try {
      await fs.access(path.join(targetDir, 'nexus-module.json'));
    } catch {
      throw new Error(
        `extracted archive for "${moduleId}" did not contain a nexus-module.json at ${targetDir}`,
      );
    }

    // Reload the registry so the new module shows up immediately.
    await this.registry.reload();
    this.logger.info(`installed community module: ${moduleId} → ${targetDir}`);
    return targetDir;
  }

  private async loadRelease(): Promise<CachedRelease> {
    if (this.cache && Date.now() - this.cache.fetchedAt < RELEASE_CACHE_TTL) {
      return this.cache;
    }
    const releases = await httpGetJson(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=30`,
    );
    if (!Array.isArray(releases)) {
      throw new Error('GitHub releases response was not an array');
    }
    const community = releases.find((r: unknown) => {
      const entry = r as { tag_name?: unknown; draft?: unknown };
      return (
        typeof entry.tag_name === 'string' &&
        entry.tag_name.startsWith(COMMUNITY_TAG_PREFIX) &&
        entry.draft !== true
      );
    }) as
      | {
          tag_name: string;
          name?: string;
          assets?: { name: string; browser_download_url: string }[];
        }
      | undefined;

    if (!community) {
      throw new Error(
        `no published release with a "${COMMUNITY_TAG_PREFIX}*" tag was found on ${REPO_OWNER}/${REPO_NAME}. ` +
          'Push a community-v* tag to publish modules.',
      );
    }

    const assets = new Map<string, string>();
    for (const a of community.assets ?? []) {
      if (typeof a?.name === 'string' && typeof a?.browser_download_url === 'string') {
        assets.set(a.name, a.browser_download_url);
      }
    }

    this.cache = {
      tag: community.tag_name,
      name: community.name ?? community.tag_name,
      assets,
      fetchedAt: Date.now(),
    };
    return this.cache;
  }
}

async function httpGetJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Nexus',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Nexus' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`download ${url} → HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}
