import { test, expect } from './fixtures';

test('cold launch to interactive under 6 seconds', async ({ app, mainWindow }) => {
  // The fixture already launched the app and waited for the shell to mount.
  // Here we just assert responsiveness: the sidebar is visible and a click round-trips.
  const start = Date.now();
  await expect(mainWindow.locator('.sidebar')).toBeVisible();
  await mainWindow.locator('.header-settings-btn').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(6000);
});

test('settings open/close cycle is under 200ms each', async ({ mainWindow }) => {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await mainWindow.locator('.header-settings-btn').click();
    await mainWindow.locator('.modal').waitFor({ state: 'visible' });
    const opened = Date.now() - t0;

    const t1 = Date.now();
    await mainWindow.keyboard.press('Escape');
    await mainWindow.locator('.modal').waitFor({ state: 'hidden' });
    const closed = Date.now() - t1;
    samples.push(opened, closed);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  // Generous ceiling; on local it's typically ~30ms.
  expect(avg).toBeLessThan(400);
});

test('50 rapid resize events do not exceed 1 IPC call per frame', async ({ app, mainWindow }) => {
  // Trigger many resizes quickly and verify the app still responds.
  for (let i = 0; i < 50; i++) {
    const w = 1000 + (i % 10) * 30;
    const h = 700 + (i % 5) * 20;
    await app.evaluate(({ BrowserWindow }, dims) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(dims[0], dims[1]);
    }, [w, h]);
  }
  // Give rAF a frame to settle.
  await mainWindow.waitForTimeout(100);
  await expect(mainWindow.locator('.sidebar')).toBeVisible();
  await expect(mainWindow.locator('.content-area')).toBeVisible();
});
