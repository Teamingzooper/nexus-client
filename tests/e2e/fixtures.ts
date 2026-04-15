import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';

interface NexusFixtures {
  app: ElectronApplication;
  mainWindow: Page;
  userData: string;
}

/**
 * Resolve the path to the packaged Nexus.app binary for the current OS/arch.
 * Tests run against this binary so we're exercising the exact code path
 * users see: ASAR layout, process.resourcesPath/modules, production bundle
 * id, real Info.plist, etc.
 *
 * The .app must be built BEFORE `npx playwright test` — the `test:e2e`
 * npm script handles this via `electron-builder --dir`. If it's missing
 * we throw a clear error telling the user how to build it.
 */
function findPackagedBinary(): string {
  const repoRoot = path.resolve(__dirname, '../../');
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    candidates.push(
      path.join(repoRoot, 'release', 'mac-arm64', 'Nexus.app', 'Contents', 'MacOS', 'Nexus'),
      path.join(repoRoot, 'release', 'mac', 'Nexus.app', 'Contents', 'MacOS', 'Nexus'),
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      path.join(repoRoot, 'release', 'win-unpacked', 'Nexus.exe'),
    );
  } else {
    candidates.push(
      path.join(repoRoot, 'release', 'linux-unpacked', 'nexus'),
    );
  }

  for (const c of candidates) {
    if (fsSync.existsSync(c)) return c;
  }

  throw new Error(
    `Packaged Nexus binary not found. Looked in:\n${candidates.map((c) => `  - ${c}`).join('\n')}\n\n` +
      `Run \`npm run dist:mac:arm64 -- --dir\` (or \`npm run launch\` once) to produce it, ` +
      `then re-run the tests. The test:e2e script does this automatically.`,
  );
}

export const test = base.extend<NexusFixtures>({
  userData: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-e2e-'));
    await use(dir);
    await fs.rm(dir, { recursive: true, force: true });
  },

  app: async ({ userData }, use) => {
    const env = {
      ...process.env,
      NEXUS_USER_DATA: userData,
      NEXUS_TEST: '1',
      ELECTRON_ENABLE_LOGGING: '1',
    };
    const executablePath = findPackagedBinary();
    const app = await electron.launch({
      executablePath,
      // No args needed — the packaged .app knows its own main entry via Info.plist.
      args: [],
      env,
      timeout: 30_000,
    });
    await use(app);
    await app.close();
  },

  mainWindow: async ({ app }, use) => {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(
      () => document.querySelector('.app') !== null || document.querySelector('.loading') !== null,
      { timeout: 15_000 },
    );
    await use(win);
  },
});

export const expect = test.expect;
