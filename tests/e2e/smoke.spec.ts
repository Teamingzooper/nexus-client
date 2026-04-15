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
  await mainWindow.locator('.header-settings-btn').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
  const cards = mainWindow.locator('.module-settings li.module-card');
  await expect(cards).toHaveCount(3);
  await expect(
    mainWindow.locator('.module-settings li:has-text("WhatsApp") button:has-text("+ Add")'),
  ).toBeVisible();
});

test('+ Instance opens the picker, picks a module, and defaults the name', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await expect(mainWindow.locator('.add-instance-modal')).toBeVisible();
  await mainWindow.locator('.module-picker-item:has-text("WhatsApp")').click();
  const input = mainWindow.locator('.add-instance-modal input');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(/WhatsApp/);
  await input.fill('Work');
  await mainWindow.locator('.confirm-ok:has-text("Create")').click();
  await expect(
    mainWindow.locator('.sidebar .module-item:has-text("Work")'),
  ).toBeVisible();
});

test('adding two instances of the same module gives unique default names', async ({
  mainWindow,
}) => {
  for (let i = 0; i < 2; i += 1) {
    await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
    await mainWindow.locator('.module-picker-item:has-text("WhatsApp")').click();
    await mainWindow.locator('.confirm-ok:has-text("Create")').click();
    await expect(mainWindow.locator('.add-instance-modal')).toBeHidden();
  }
  await expect(
    mainWindow.locator('.sidebar .module-item:has-text("WhatsApp 2")'),
  ).toBeVisible();
});

test('sidebar instance can be renamed via double-click', async ({ mainWindow }) => {
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await mainWindow.locator('.module-picker-item:has-text("Telegram")').click();
  await mainWindow.locator('.confirm-ok:has-text("Create")').click();

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

test('deleting an instance requires confirmation', async ({ mainWindow }) => {
  // Seed an instance.
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await mainWindow.locator('.module-picker-item:has-text("WhatsApp")').click();
  await mainWindow.locator('.confirm-ok:has-text("Create")').click();
  const item = mainWindow.locator('.sidebar .module-item:has-text("WhatsApp")');
  await expect(item).toBeVisible();

  // Click the remove × — a confirm dialog should appear.
  await item.locator('.module-remove').click({ force: true });
  const confirm = mainWindow.locator('.confirm-modal');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Delete WhatsApp');

  // Cancel first — instance should still be there.
  await mainWindow.locator('.confirm-cancel').click();
  await expect(confirm).toBeHidden();
  await expect(item).toBeVisible();

  // Now confirm — instance is gone.
  await item.locator('.module-remove').click({ force: true });
  await mainWindow.locator('.confirm-ok.danger').click();
  await expect(
    mainWindow.locator('.sidebar .module-item:has-text("WhatsApp")'),
  ).toHaveCount(0);
});

test('any overlay collapses the active WebContentsView to zero bounds (settings)', async ({
  app,
  mainWindow,
}) => {
  // Seed an instance so a WebContentsView exists and is attached.
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await mainWindow.locator('.module-picker-item:has-text("WhatsApp")').click();
  await mainWindow.locator('.confirm-ok:has-text("Create")').click();
  await mainWindow.waitForTimeout(300);

  const getActiveBounds = () =>
    app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const children = (win as any).contentView.children as any[];
      const last = children[children.length - 1];
      if (!last || typeof last.getBounds !== 'function') return null;
      return last.getBounds();
    });

  const before = await getActiveBounds();
  expect(before).not.toBeNull();
  expect(before!.width).toBeGreaterThan(0);
  expect(before!.height).toBeGreaterThan(0);

  // Open settings — view must collapse.
  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.waitForTimeout(150);
  const suspended = await getActiveBounds();
  expect(suspended!.width).toBe(0);
  expect(suspended!.height).toBe(0);

  // Close settings — view must restore.
  await mainWindow.keyboard.press('Escape');
  await mainWindow.waitForTimeout(150);
  const after = await getActiveBounds();
  expect(after!.width).toBeGreaterThan(0);
  expect(after!.height).toBeGreaterThan(0);
});

test('confirm dialog triggered from sidebar also collapses the view', async ({
  app,
  mainWindow,
}) => {
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await mainWindow.locator('.module-picker-item:has-text("WhatsApp")').click();
  await mainWindow.locator('.confirm-ok:has-text("Create")').click();
  await mainWindow.waitForTimeout(300);

  const getActiveBounds = () =>
    app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const children = (win as any).contentView.children as any[];
      const last = children[children.length - 1];
      if (!last || typeof last.getBounds !== 'function') return null;
      return last.getBounds();
    });

  // Before: view has real bounds.
  expect((await getActiveBounds())!.width).toBeGreaterThan(0);

  // Fire the confirm dialog via the sidebar × button.
  await mainWindow
    .locator('.sidebar .module-item:has-text("WhatsApp") .module-remove')
    .click({ force: true });
  await mainWindow.waitForTimeout(150);

  // View must be suspended so the confirm dialog isn't hidden under it.
  const suspended = await getActiveBounds();
  expect(suspended!.width).toBe(0);
  expect(suspended!.height).toBe(0);

  // Cancel — view restores.
  await mainWindow.locator('.confirm-cancel').click();
  await mainWindow.waitForTimeout(150);
  expect((await getActiveBounds())!.width).toBeGreaterThan(0);
});

test('add-instance dialog also suspends views when opened over an active instance', async ({
  app,
  mainWindow,
}) => {
  // Create one instance first.
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await mainWindow.locator('.module-picker-item:has-text("WhatsApp")').click();
  await mainWindow.locator('.confirm-ok:has-text("Create")').click();
  await mainWindow.waitForTimeout(300);

  const getActiveBounds = () =>
    app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const children = (win as any).contentView.children as any[];
      const last = children[children.length - 1];
      if (!last || typeof last.getBounds !== 'function') return null;
      return last.getBounds();
    });

  // Open + Instance again to get the picker — view must collapse.
  await mainWindow.locator('.sidebar-action', { hasText: '+ Instance' }).click();
  await mainWindow.waitForTimeout(150);
  const suspended = await getActiveBounds();
  expect(suspended!.width).toBe(0);
});

test('Notifications tab exposes enable toggle, sound toggle, and test button', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.locator('.tab:has-text("Notifications")').click();

  const enableToggle = mainWindow
    .locator('.settings-toggle:has-text("Enable native notifications") input[type="checkbox"]');
  await expect(enableToggle).toBeVisible();
  await expect(enableToggle).toBeChecked();

  const soundToggle = mainWindow
    .locator('.settings-toggle:has-text("Play notification sound") input[type="checkbox"]');
  await expect(soundToggle).toBeVisible();
  await expect(soundToggle).toBeChecked();

  await expect(
    mainWindow.locator('.settings-action-row button:has-text("Send test notification")'),
  ).toBeVisible();

  // Toggling the enable flag disables the sound toggle (sound gated on enable).
  await enableToggle.click();
  await expect(soundToggle).toBeDisabled();
  await enableToggle.click();
  await expect(soundToggle).toBeEnabled();
});

test('General tab has launch-at-login, compact sidebar, and danger zone', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.locator('.tab:has-text("General")').click();
  await expect(
    mainWindow.locator('.settings-toggle:has-text("Launch at login")'),
  ).toBeVisible();
  await expect(
    mainWindow.locator('.settings-toggle:has-text("Compact sidebar")'),
  ).toBeVisible();
  await expect(mainWindow.locator('.danger-button:has-text("Clear all data")')).toBeVisible();
});

test('Compact sidebar toggle shrinks the sidebar', async ({ mainWindow }) => {
  const sidebar = mainWindow.locator('.sidebar');
  const wide = await sidebar.boundingBox();
  expect(wide!.width).toBeGreaterThan(180);

  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.locator('.tab:has-text("General")').click();
  await mainWindow
    .locator('.settings-toggle:has-text("Compact sidebar") input[type="checkbox"]')
    .click();
  await mainWindow.keyboard.press('Escape');
  // Give the CSS transition a frame to settle.
  await mainWindow.waitForTimeout(250);
  const narrow = await sidebar.boundingBox();
  expect(narrow!.width).toBeLessThan(120);
});

test('clear all data button lives in settings with a confirm guard', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.locator('.tab:has-text("General")').click();
  const btn = mainWindow.locator('.danger-button:has-text("Clear all data")');
  await expect(btn).toBeVisible();
  await btn.click();
  const confirm = mainWindow.locator('.confirm-modal.danger');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Clear all Nexus data');
  // Cancel — nothing should happen.
  await mainWindow.locator('.confirm-cancel').click();
  await expect(confirm).toBeHidden();
});

test('settings button is in the top app header, not the sidebar footer', async ({
  mainWindow,
}) => {
  await expect(mainWindow.locator('.app-header .header-settings-btn')).toBeVisible();
  await expect(mainWindow.locator('.sidebar .settings-btn')).toHaveCount(0);
  // Sidebar footer has + Group and + Instance.
  await expect(
    mainWindow.locator('.sidebar-footer .sidebar-action:has-text("+ Instance")'),
  ).toBeVisible();
  await expect(
    mainWindow.locator('.sidebar-footer .sidebar-action:has-text("+ Group")'),
  ).toBeVisible();
});

test('settings modal opens above the content area (not hidden by embeds)', async ({
  mainWindow,
}) => {
  await mainWindow.locator('.header-settings-btn').click();
  const modal = mainWindow.locator('.modal');
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(100);
});

test('Escape closes the settings modal', async ({ mainWindow }) => {
  await mainWindow.locator('.header-settings-btn').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
  await mainWindow.keyboard.press('Escape');
  await expect(mainWindow.locator('.modal')).toBeHidden();
});

test('Cmd+, opens settings', async ({ mainWindow }) => {
  await mainWindow.keyboard.press('Meta+,');
  await expect(mainWindow.locator('.modal')).toBeVisible();
});

test('theme switching updates CSS variables on :root', async ({ mainWindow }) => {
  await mainWindow.locator('.header-settings-btn').click();
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
  await mainWindow.locator('.header-settings-btn').click();
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
  await mainWindow.locator('.header-settings-btn').click();
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
  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.locator('button:has-text("Reload modules")').click();
  await expect(mainWindow.locator('.modal')).toBeVisible();
});

test('General tab shows keyboard shortcuts', async ({ mainWindow }) => {
  await mainWindow.locator('.header-settings-btn').click();
  await mainWindow.locator('.tab:has-text("General")').click();
  await expect(mainWindow.locator('.shortcuts')).toBeVisible();
  await expect(mainWindow.locator('.shortcuts kbd').first()).toBeVisible();
});
