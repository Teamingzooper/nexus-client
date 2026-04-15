import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

interface NexusFixtures {
  app: ElectronApplication;
  mainWindow: Page;
  userData: string;
}

export const test = base.extend<NexusFixtures>({
  userData: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-e2e-'));
    await use(dir);
    await fs.rm(dir, { recursive: true, force: true });
  },

  app: async ({ userData }, use) => {
    // Isolated user-data dir, safe URL (about:blank) so no network hits.
    const env = {
      ...process.env,
      NEXUS_USER_DATA: userData,
      NEXUS_TEST: '1',
      ELECTRON_ENABLE_LOGGING: '1',
    };
    const repoRoot = path.resolve(__dirname, '../../');
    const mainEntry = path.join(repoRoot, 'dist', 'main', 'main', 'index.js');
    const app = await electron.launch({
      args: [mainEntry],
      cwd: repoRoot,
      env,
      timeout: 30_000,
    });
    await use(app);
    await app.close();
  },

  mainWindow: async ({ app }, use) => {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    // Wait for the app root to be populated.
    await win.waitForFunction(
      () => document.querySelector('.app') !== null || document.querySelector('.loading') !== null,
      { timeout: 15_000 },
    );
    await use(win);
  },
});

export const expect = test.expect;
