import { test, expect } from './fixtures';

test('launches and renders the shell', async ({ mainWindow }) => {
  await expect(mainWindow.locator('.app')).toBeVisible();
  await expect(mainWindow.locator('.app-header')).toBeVisible();
  await expect(mainWindow.locator('.sidebar')).toBeVisible();
  await expect(mainWindow.locator('.content-area')).toBeVisible();
  await expect(mainWindow.locator('.empty-state h2')).toHaveText('Welcome to Nexus');
});

test('app header shows a refresh button (disabled when no active module)', async ({
  mainWindow,
}) => {
  const btn = mainWindow.locator('.header-btn', { hasText: 'Refresh' });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});

test('sidebar renders a default group "Modules"', async ({ mainWindow }) => {
  await expect(mainWindow.locator('.sidebar-group')).toHaveCount(1);
  await expect(mainWindow.locator('.group-name').first()).toContainText('Modules');
});

test('new-group button adds a group and puts it into rename mode', async ({ mainWindow }) => {
  await mainWindow.locator('.sidebar-action', { hasText: '+ Group' }).click();
  await expect(mainWindow.locator('.sidebar-group')).toHaveCount(2);
  // The new group's name is editable (input is focused).
  const input = mainWindow.locator('.group-rename-input');
  await expect(input).toBeVisible();
  await input.fill('Work');
  await input.press('Enter');
  await expect(mainWindow.locator('.group-name').nth(1)).toContainText('Work');
});

test('settings modules tab lists bundled modules with + Add buttons', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.settings-btn').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
  const cards = mainWindow.locator('.module-settings li.module-card');
  await expect(cards).toHaveCount(3);
  await expect(
    mainWindow.locator('.module-settings li:has-text("WhatsApp") button:has-text("+ Add")'),
  ).toBeVisible();
});

test('add instance creates a sidebar entry with the module name', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('.module-card:has-text("WhatsApp") button:has-text("+ Add")').click();
  // The instance tag appears in settings.
  await expect(mainWindow.locator('.instance-tag:has-text("WhatsApp")')).toBeVisible();
  // And the sidebar shows an entry with the instance name.
  await mainWindow.keyboard.press('Escape');
  await expect(
    mainWindow.locator('.sidebar .module-item:has-text("WhatsApp")'),
  ).toBeVisible();
});

test('adding two instances of the same module gives unique names', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  const addBtn = mainWindow.locator('.module-card:has-text("WhatsApp") button:has-text("+ Add")');
  await addBtn.click();
  await addBtn.click();
  await expect(mainWindow.locator('.instance-tag:has-text("WhatsApp 2")')).toBeVisible();
  await mainWindow.keyboard.press('Escape');
  await expect(
    mainWindow.locator('.sidebar .module-item:has-text("WhatsApp 2")'),
  ).toBeVisible();
});

test('sidebar instance can be renamed via double-click', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('.module-card:has-text("Telegram") button:has-text("+ Add")').click();
  await mainWindow.keyboard.press('Escape');

  const item = mainWindow.locator('.sidebar .module-item:has-text("Telegram")');
  await item.dblclick();

  const input = mainWindow.locator('.instance-rename-input');
  await expect(input).toBeVisible();
  await input.fill('Personal');
  await input.press('Enter');

  await expect(
    mainWindow.locator('.sidebar .module-item:has-text("Personal")'),
  ).toBeVisible();
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

test('color picker is always enabled and auto-drafts on change', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('.tab:has-text("Themes")').click();

  // On a built-in theme, no draft exists yet and Save/Cancel shouldn't be visible.
  await expect(mainWindow.locator('button:has-text("Save")')).toHaveCount(0);

  // The color pickers must NOT be disabled (this was the bug).
  const firstPicker = mainWindow.locator('.color-field input[type="color"]').first();
  await expect(firstPicker).toBeEnabled();

  // React controlled <input> needs the native setter to notice value mutations from tests.
  await firstPicker.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(el, '#ff00aa');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Save button should now appear (draft was auto-created).
  await expect(mainWindow.locator('button:has-text("Save")')).toBeVisible();

  // And the CSS variable should immediately reflect the live preview.
  const bg = await mainWindow.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nx-bg').trim(),
  );
  expect(bg.toLowerCase()).toBe('#ff00aa');
});

test('theme pack export/import buttons are visible', async ({ mainWindow }) => {
  await mainWindow.locator('.settings-btn').click();
  await mainWindow.locator('.tab:has-text("Themes")').click();
  await expect(mainWindow.locator('button:has-text("Import pack")')).toBeVisible();
  await expect(mainWindow.locator('button:has-text("Export current")')).toBeVisible();
  await expect(mainWindow.locator('button:has-text("Export all custom")')).toBeVisible();
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
