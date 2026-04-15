import { test, expect } from './fixtures';

test('launches and renders the shell', async ({ mainWindow }) => {
  await expect(mainWindow.locator('.app')).toBeVisible();
  await expect(mainWindow.locator('.sidebar')).toBeVisible();
  await expect(mainWindow.locator('.content-area')).toBeVisible();
  await expect(mainWindow.locator('.empty-state h2')).toHaveText('Welcome to Nexus');
});

test('sidebar shows bundled modules as enableable', async ({ mainWindow }) => {
  // Open settings via button
  await mainWindow.locator('.settings-btn').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
  const rows = mainWindow.locator('.module-settings li');
  // WhatsApp / Telegram / Messenger come bundled.
  await expect(rows).toHaveCount(3);
  await expect(mainWindow.locator('.module-settings li:has-text("WhatsApp")')).toBeVisible();
});

test('settings modal opens above the content area (not hidden by embeds)', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.settings-btn').click();
  const modal = mainWindow.locator('.modal');
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(100);
});

test('Escape closes the settings modal', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
  await mainWindow.keyboard.press('Escape');
  await expect(mainWindow.locator('.modal')).toBeHidden();
});

test('Cmd+, opens settings', async ({ mainWindow }) => {
  await mainWindow.keyboard.press('Meta+,');
  await expect(mainWindow.locator('.modal')).toBeVisible();
});

test('theme switching updates CSS variables on :root', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('.tab:has-text("Themes")').click();

  const before = await mainWindow.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nx-accent').trim(),
  );

  await mainWindow.locator('.theme-editor select').selectOption('nexus-light');

  await mainWindow.waitForFunction(
    (prev) =>
      getComputedStyle(document.documentElement).getPropertyValue('--nx-accent').trim() !==
      prev,
    before,
    { timeout: 3000 },
  );

  const after = await mainWindow.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nx-accent').trim(),
  );
  expect(after).not.toBe(before);
});

test('window resize reports new bounds without crashing', async ({ app, mainWindow }) => {
  const sizes: [number, number][] = [
    [1200, 800],
    [1500, 900],
    [1000, 700],
    [1400, 850],
  ];
  for (const [w, h] of sizes) {
    await app.evaluate(({ BrowserWindow }, [width, height]) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(width as number, height as number);
    }, [w, h]);
    // Let rAF fire.
    await mainWindow.waitForTimeout(80);
  }
  // The app is still responsive.
  await expect(mainWindow.locator('.sidebar')).toBeVisible();
});

test('reload modules button does not blow up the shell', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('button:has-text("Reload modules")').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
});

test('about tab shows keyboard shortcuts', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('.tab:has-text("About")').click();
  await expect(mainWindow.locator('.shortcuts')).toBeVisible();
  await expect(mainWindow.locator('.shortcuts kbd').first()).toBeVisible();
});
