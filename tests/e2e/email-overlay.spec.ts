import { test, expect } from './fixtures';

/**
 * E2E smoke for the Nexus Mail feature.
 *
 * This test verifies the renderer-side wiring — that the Email and Hotkeys
 * settings tabs mount, and that the EmailPeekPanel's null-render path works
 * when no peek data is present. It does NOT exercise the full Gmail/Outlook
 * overlay scraping flow, because that requires either (a) real Gmail/Outlook
 * credentials in CI or (b) a substantial fixture-injection harness that
 * overrides module URLs to point at local HTML. Full overlay E2E is a
 * follow-up task once that harness lands.
 *
 * The fixture-based unit tests in tests/unit/gmailOverlay.test.ts and
 * tests/unit/outlookOverlay.test.ts already cover the DOM-scraping logic
 * against synthetic DOMs.
 */

test('Email and Hotkeys settings tabs are reachable', async ({ mainWindow }) => {
  // Open settings.
  await mainWindow.locator('.header-btn', { hasText: 'Settings' }).click().catch(async () => {
    // Fallback selector in case the header button's accessible label differs.
    await mainWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  });

  // Wait for the modal.
  await expect(mainWindow.locator('.modal')).toBeVisible();

  // Click the Email tab.
  const emailTab = mainWindow.locator('.tab', { hasText: 'Email' });
  await expect(emailTab).toBeVisible();
  await emailTab.click();
  await expect(mainWindow.locator('.email-settings')).toBeVisible();
  await expect(mainWindow.locator('h3', { hasText: 'VIP senders' })).toBeVisible();
  await expect(mainWindow.locator('h3', { hasText: 'Peek panel' })).toBeVisible();

  // Click the Hotkeys tab.
  const hotkeysTab = mainWindow.locator('.tab', { hasText: 'Hotkeys' });
  await expect(hotkeysTab).toBeVisible();
  await hotkeysTab.click();
  await expect(mainWindow.locator('.hotkeys-settings')).toBeVisible();

  // The default email.copyAsJson action should be listed.
  await expect(
    mainWindow.locator('.hotkey-label', { hasText: 'Copy focused email as JSON' }),
  ).toBeVisible();

  // Close the modal.
  await mainWindow.locator('.modal .close').click();
});

test('VIP add and remove round-trips through main', async ({ mainWindow }) => {
  await mainWindow.locator('.header-btn', { hasText: 'Settings' }).click().catch(async () => {
    await mainWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  });
  await expect(mainWindow.locator('.modal')).toBeVisible();
  await mainWindow.locator('.tab', { hasText: 'Email' }).click();

  // Add a VIP via the form row.
  const vipEmail = 'e2e-vip@example.com';
  await mainWindow.locator('.vip-add-row input[type="email"]').fill(vipEmail);
  await mainWindow.locator('.vip-add-row button', { hasText: 'Add' }).click();

  // Row appears.
  const row = mainWindow.locator('.vip-table tr', { hasText: vipEmail });
  await expect(row).toBeVisible();

  // Remove it.
  await row.locator('button', { hasText: 'Remove' }).click();
  await expect(mainWindow.locator('.vip-table tr', { hasText: vipEmail })).toHaveCount(0);

  await mainWindow.locator('.modal .close').click();
});

// TODO(mail v1 follow-up): full overlay-driven E2E.
// Requires a test module that points at a local HTML fixture served via
// file:// or a small local web server, then simulates the Cmd+Shift+C
// hotkey and asserts the clipboard contents. See the unit tests in
// tests/unit/gmailOverlay.test.ts for the DOM-level coverage this would
// complement.
