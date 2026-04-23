import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { UserscriptService } from './userscriptService';
import { userscriptFilenameSchema } from '../../shared/userscripts';

/**
 * Fetches the catalogue of community-maintained userscripts published on the
 * latest `community-userscripts-v*` GitHub release and installs individual
 * scripts on request.
 *
 * Mirrors CommunityModulesService (`community-v*` releases) but tuned for
 * userscripts: every script is a single `.user.js` or `.user.css` file, so
 * there's no zip extraction — we just download the file into the user's
 * userscripts folder and let UserscriptService's watcher pick it up.
 *
 * Release layout (produced by scripts/pack-community-userscripts.js):
 *   index.json                     — catalogue with metadata
 *   <filename>.user.js / .user.css — one per script
 */

const REPO_OWNER = 'Teamingzooper';
const REPO_NAME = 'nexus-client';
const COMMUNITY_TAG_PREFIX = 'community-userscripts-v';

const catalogueEntrySchema = z.object({
  filename: userscriptFilenameSchema,
  type: z.enum(['js', 'css']),
  name: z.string().min(1).max(128),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  module: z.string().nullable().optional(),
  matches: z.array(z.string()).default([]),
  runAt: z.string().optional(),
});

const catalogueSchema = z.object({
  version: z.literal(1),
  scripts: z.array(catalogueEntrySchema),
});

export type CommunityUserscript = z.infer<typeof catalogueEntrySchema>;

export interface CommunityUserscriptListing {
  tag: string;
  name: string;
  scripts: CommunityUserscript[];
}

interface CachedRelease {
  tag: string;
  name: string;
  assets: Map<string, string>;
  fetchedAt: number;
}

const RELEASE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class CommunityUserscriptsService implements Service {
  readonly name = 'community-userscripts';
  private logger!: Logger;
  private userscripts!: UserscriptService;
  private userDir = '';
  private cache: CachedRelease | null = null;

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('community-userscripts');
    this.userscripts = ctx.container.get<UserscriptService>('userscripts');
    this.userDir = path.join(ctx.userData, 'userscripts');
  }

  async list(): Promise<CommunityUserscriptListing> {
    const release = await this.loadRelease();
    const indexUrl = release.assets.get('index.json');
    if (!indexUrl) {
      throw new Error(
        `community userscripts release ${release.tag} is missing index.json`,
      );
    }
    const body = await httpGetJson(indexUrl);
    const parsed = catalogueSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(`community userscripts index failed validation: ${parsed.error.message}`);
    }
    return {
      tag: release.tag,
      name: release.name,
      scripts: parsed.data.scripts,
    };
  }

  /**
   * Download <filename>.user.js|.user.css from the latest community release
   * and drop it into the user's userscripts folder. UserscriptService's
   * `fs.watch` picks up the new file and rescans; the renderer sees it via
   * the `userscripts:changed` broadcast.
   *
   * Refuses to overwrite an already-installed script with the same filename
   * unless `overwrite` is true, so a fresh install doesn't nuke local edits.
   */
  async install(filename: string, overwrite = false): Promise<string> {
    const parsed = userscriptFilenameSchema.safeParse(filename);
    if (!parsed.success) throw new Error(`invalid userscript filename: ${filename}`);

    const release = await this.loadRelease();
    const url = release.assets.get(filename);
    if (!url) {
      throw new Error(
        `userscript "${filename}" not found in community release ${release.tag}`,
      );
    }

    await fs.mkdir(this.userDir, { recursive: true });
    const target = path.join(this.userDir, filename);
    if (path.dirname(target) !== this.userDir) {
      throw new Error('filename escapes userscripts dir');
    }

    const alreadyExists = await fs
      .access(target)
      .then(() => true)
      .catch(() => false);
    if (alreadyExists && !overwrite) {
      throw new Error(
        `"${filename}" is already installed. Open the Userscripts tab to edit or delete it, or pass overwrite=true to replace.`,
      );
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Nexus' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
    const source = await res.text();

    // Route through UserscriptService.save so the existing enabled/disabled
    // state, rescan, and bus broadcast all run the same way they do for
    // in-app edits.
    await this.userscripts.save(filename, source);
    this.logger.info(`installed community userscript: ${filename}`);
    return target;
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
          'Push a community-userscripts-v* tag to publish scripts.',
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
