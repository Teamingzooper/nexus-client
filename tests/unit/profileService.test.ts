import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ProfileService } from '../../src/main/services/profileService';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';
import { ServiceContainer } from '../../src/main/core/service';

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

async function newTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'nexus-profiles-'));
}

describe('ProfileService', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await newTmp();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  describe('first launch', () => {
    it('creates an empty Default profile when nothing exists on disk', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      const list = s.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('default');
      expect(list[0].name).toBe('Default');
      expect(list[0].hasPassword).toBe(false);
      await s.dispose();
    });
  });

  describe('legacy migration', () => {
    it('moves instances + sidebarLayout from nexus-state.json into Default', async () => {
      const file = path.join(tmp, 'nexus-state.json');
      await fs.writeFile(
        file,
        JSON.stringify({
          activeInstanceId: 'whatsapp',
          instances: [
            { id: 'whatsapp', moduleId: 'whatsapp', name: 'WhatsApp', createdAt: 1 },
            { id: 'telegram', moduleId: 'telegram', name: 'Telegram', createdAt: 2 },
          ],
          themeId: 'nexus-dark',
          sidebarLayout: {
            groups: [{ id: 'main', name: 'Modules', entryIds: ['whatsapp', 'telegram'] }],
          },
        }),
        'utf8',
      );

      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.unlock('default');

      expect(s.list()).toHaveLength(1);
      expect(s.state.instances.map((i) => i.id)).toEqual(['whatsapp', 'telegram']);
      expect(s.state.activeInstanceId).toBe('whatsapp');
      // Partitions should be preserved in legacy form so users don't lose logins.
      expect(s.state.instances[0].partition).toBe('persist:whatsapp');
      expect(s.state.instances[1].partition).toBe('persist:telegram');

      // Original file should be renamed to a backup.
      await expect(fs.access(`${file}.pre-profiles.bak`)).resolves.toBeUndefined();
      await s.dispose();
    });

    it('is idempotent across restarts', async () => {
      await fs.writeFile(
        path.join(tmp, 'nexus-state.json'),
        JSON.stringify({ instances: [], activeInstanceId: null, themeId: 'nexus-dark' }),
        'utf8',
      );
      const s1 = new ProfileService();
      await s1.init(makeCtx(tmp));
      await s1.dispose();

      const s2 = new ProfileService();
      await s2.init(makeCtx(tmp));
      expect(s2.list()).toHaveLength(1);
      expect(s2.list()[0].id).toBe('default');
      await s2.dispose();
    });
  });

  describe('profile CRUD', () => {
    it('creates password-less profiles', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      const p = await s.createProfile({ name: 'Work' });
      expect(p.id).toBe('work');
      expect(p.hasPassword).toBe(false);
      expect(s.list()).toHaveLength(2);
      await s.dispose();
    });

    it('creates password-protected profiles', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      const p = await s.createProfile({ name: 'Secret', password: 'hunter2' });
      expect(p.hasPassword).toBe(true);
      await s.dispose();
    });

    it('generates unique ids for duplicate names', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      const a = await s.createProfile({ name: 'Work' });
      const b = await s.createProfile({ name: 'Work' });
      expect(a.id).not.toBe(b.id);
      await s.dispose();
    });

    it('rejects empty names', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await expect(s.createProfile({ name: '   ' })).rejects.toThrow(/name/);
      await s.dispose();
    });

    it('refuses to delete the only profile', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await expect(s.deleteProfile('default')).rejects.toThrow(/only profile/);
      await s.dispose();
    });

    it('deletes a profile and locks if it was active', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Work' });
      await s.unlock('work');
      expect(s.isLocked()).toBe(false);
      await s.deleteProfile('work');
      expect(s.isLocked()).toBe(true);
      expect(s.list()).toHaveLength(1);
      await s.dispose();
    });

    it('renames a profile', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      s.renameProfile('default', 'Main');
      expect(s.list()[0].name).toBe('Main');
      await s.dispose();
    });
  });

  describe('unlock / lock', () => {
    it('unlocks a password-less profile', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.unlock('default');
      expect(s.isLocked()).toBe(false);
      expect(s.state.instances).toEqual([]);
      await s.dispose();
    });

    it('requires a password for password-protected profiles', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Secret', password: 'hunter2' });
      await expect(s.unlock('secret')).rejects.toThrow(/password required/);
      await expect(s.unlock('secret', 'wrong')).rejects.toThrow(/wrong password/);
      await s.unlock('secret', 'hunter2');
      expect(s.isLocked()).toBe(false);
      await s.dispose();
    });

    it('state is cleared on lock', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.unlock('default');
      s.addInstance('whatsapp', 'WhatsApp');
      expect(s.state.instances).toHaveLength(1);
      s.lock();
      expect(s.isLocked()).toBe(true);
      expect(s.state.instances).toEqual([]);
      await s.dispose();
    });

    it('instance operations throw when locked', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      expect(() => s.addInstance('whatsapp', 'WhatsApp')).toThrow(/no profile unlocked/);
      await s.dispose();
    });
  });

  describe('per-profile instance isolation', () => {
    it('instances in one profile don\u2019t appear in another', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Work' });
      await s.createProfile({ name: 'Personal' });

      await s.unlock('work');
      s.addInstance('whatsapp', 'WhatsApp');
      expect(s.state.instances).toHaveLength(1);
      expect(s.state.instances[0].partition).toBe('persist:work:whatsapp');

      await s.unlock('personal');
      expect(s.state.instances).toHaveLength(0);
      s.addInstance('whatsapp', 'WhatsApp');
      expect(s.state.instances[0].partition).toBe('persist:personal:whatsapp');

      // Switch back — Work's instance is still there.
      await s.unlock('work');
      expect(s.state.instances).toHaveLength(1);
      expect(s.state.instances[0].partition).toBe('persist:work:whatsapp');
      await s.dispose();
    });

    it('encrypted profile persists instances across reloads', async () => {
      const s1 = new ProfileService();
      await s1.init(makeCtx(tmp));
      await s1.createProfile({ name: 'Vault', password: 'hunter2' });
      await s1.unlock('vault', 'hunter2');
      s1.addInstance('telegram', 'Telegram');
      await s1.dispose();

      const s2 = new ProfileService();
      await s2.init(makeCtx(tmp));
      await s2.unlock('vault', 'hunter2');
      expect(s2.state.instances).toHaveLength(1);
      expect(s2.state.instances[0].name).toBe('Telegram');
      await s2.dispose();
    });

    it('encrypted profile state is unreadable without the password', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Vault', password: 'hunter2' });
      await s.unlock('vault', 'hunter2');
      s.addInstance('whatsapp', 'WhatsApp');
      await s.dispose();

      // Inspect the on-disk file directly — the instance name must not
      // appear in plaintext.
      const raw = await fs.readFile(path.join(tmp, 'profiles.json'), 'utf8');
      expect(raw).not.toContain('WhatsApp');
    });
  });

  describe('changePassword', () => {
    it('sets a password on a password-less profile', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.unlock('default');
      s.addInstance('whatsapp', 'WhatsApp');
      await s.changePassword('default', null, 'newpw');
      expect(s.list()[0].hasPassword).toBe(true);
      // The current session stays unlocked.
      expect(s.isLocked()).toBe(false);
      expect(s.state.instances).toHaveLength(1);
      await s.dispose();
    });

    it('changes an existing password', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Vault', password: 'old' });
      await s.unlock('vault', 'old');
      await s.changePassword('vault', 'old', 'new');
      s.lock();
      await expect(s.unlock('vault', 'old')).rejects.toThrow(/wrong password/);
      await s.unlock('vault', 'new');
      await s.dispose();
    });

    it('clears a password (plaintext after)', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Vault', password: 'hunter2' });
      await s.unlock('vault', 'hunter2');
      await s.changePassword('vault', 'hunter2', null);
      expect(s.list().find((p) => p.id === 'vault')?.hasPassword).toBe(false);
      s.lock();
      await s.unlock('vault'); // no password needed anymore
      await s.dispose();
    });

    it('rejects changePassword with wrong old password', async () => {
      const s = new ProfileService();
      await s.init(makeCtx(tmp));
      await s.createProfile({ name: 'Vault', password: 'old' });
      await expect(
        s.changePassword('vault', 'wrong', 'new'),
      ).rejects.toThrow(/wrong password/);
      await s.dispose();
    });
  });
});
