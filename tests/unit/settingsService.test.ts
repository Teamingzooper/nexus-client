import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SettingsService } from '../../src/main/services/settingsService';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';
import { ServiceContainer } from '../../src/main/core/service';

async function mktmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'nexus-settings-'));
}

function makeCtx(userData: string) {
  return {
    container: new ServiceContainer({
      logger: new Logger('test', 'error'),
      bus: new EventBus(),
      userData,
      appPath: userData,
      isDev: false,
    }),
    logger: new Logger('test', 'error'),
    bus: new EventBus(),
    userData,
    appPath: userData,
    isDev: false,
  };
}

describe('SettingsService (global prefs only)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mktmp();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('starts with defaults when no file exists', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    expect(s.state.themeId).toBe('nexus-dark');
    expect(s.state.activeProfileId).toBeNull();
    expect(s.state.notificationsEnabled).toBe(true);
    await s.dispose();
  });

  it('activeProfileId round-trips through disk', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    s1.setActiveProfileId('work');
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.activeProfileId).toBe('work');
    await s2.dispose();
  });

  it('notificationsEnabled defaults to true and round-trips through disk', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    expect(s1.state.notificationsEnabled).toBe(true);
    s1.setNotificationsEnabled(false);
    expect(s1.state.notificationsEnabled).toBe(false);
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.notificationsEnabled).toBe(false);
    await s2.dispose();
  });

  it('new boolean settings default correctly and round-trip through disk', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    expect(s1.state.notificationSound).toBe(true);
    expect(s1.state.launchAtLogin).toBe(false);
    expect(s1.state.sidebarCompact).toBe(false);

    s1.setNotificationSound(false);
    s1.setLaunchAtLogin(true);
    s1.setSidebarCompact(true);
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.notificationSound).toBe(false);
    expect(s2.state.launchAtLogin).toBe(true);
    expect(s2.state.sidebarCompact).toBe(true);
    await s2.dispose();
  });

  it('setWindowState persists and survives reload', async () => {
    const s1 = new SettingsService();
    await s1.init(makeCtx(tmp));
    s1.setWindowState({ x: 100, y: 200, width: 1400, height: 900, maximized: true });
    await s1.dispose();

    const s2 = new SettingsService();
    await s2.init(makeCtx(tmp));
    expect(s2.state.windowState).toEqual({
      x: 100,
      y: 200,
      width: 1400,
      height: 900,
      maximized: true,
    });
    await s2.dispose();
  });

  it('recovers from corrupt state file', async () => {
    const file = path.join(tmp, 'nexus-app-state.json');
    await fs.writeFile(file, '{not json', 'utf8');
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    expect(s.state.themeId).toBe('nexus-dark');
    await s.dispose();
  });

  it('clearAll resets every field to defaults and removes the state file', async () => {
    const s = new SettingsService();
    await s.init(makeCtx(tmp));
    s.setTheme('nexus-light');
    s.setActiveProfileId('work');
    await s.dispose();
    await s.init(makeCtx(tmp));
    expect(s.state.themeId).toBe('nexus-light');

    await s.clearAll();
    expect(s.state.themeId).toBe('nexus-dark');
    expect(s.state.activeProfileId).toBeNull();

    await expect(
      fs.access(path.join(tmp, 'nexus-app-state.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
