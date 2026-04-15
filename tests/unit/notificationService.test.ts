import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dockMock, notifMock } = vi.hoisted(() => ({
  dockMock: { setBadge: vi.fn() },
  notifMock: {
    show: vi.fn(),
    on: vi.fn(),
    lastOpts: null as any,
  },
}));

vi.mock('electron', () => {
  class FakeNotification {
    constructor(opts: any) {
      notifMock.lastOpts = opts;
    }
    static isSupported() {
      return true;
    }
    show() {
      notifMock.show();
    }
    on(event: string, handler: () => void) {
      notifMock.on(event, handler);
    }
  }
  return {
    app: { dock: dockMock },
    BrowserWindow: class {},
    Notification: FakeNotification,
  };
});

import { NotificationService } from '../../src/main/services/notificationService';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';
import { ServiceContainer } from '../../src/main/core/service';

class FakeWindowService {
  readonly name = 'window';
  private sent: any[] = [];
  private destroyed = false;
  win = {
    isDestroyed: () => this.destroyed,
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isMinimized: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => this.sent.push({ channel, payload }),
    },
  };
  init() {}
  getWindow() {
    return this.win as any;
  }
  get messages() {
    return this.sent;
  }
}

class FakeSettingsService {
  readonly name = 'settings';
  state = {
    themeId: 'nexus-dark',
    activeProfileId: null as string | null,
    notificationsEnabled: true as boolean,
    notificationSound: true as boolean,
  };
  init() {}
}

class FakeProfileService {
  readonly name = 'profiles';
  state = {
    activeInstanceId: null as string | null,
    instances: [] as Array<{ id: string; moduleId: string; name: string }>,
  };
  init() {}
  getInstance(id: string) {
    return this.state.instances.find((i) => i.id === id);
  }
  setActive(id: string | null) {
    this.state.activeInstanceId = id;
  }
  addFakeInstance(id: string, name: string) {
    this.state.instances.push({ id, moduleId: id, name });
  }
}

class FakeViewService {
  readonly name = 'views';
  activate = vi.fn();
  init() {}
}

async function makeContainer() {
  const bus = new EventBus();
  const container = new ServiceContainer({
    logger: new Logger('test', 'error'),
    bus,
    userData: '/tmp',
    appPath: '/tmp',
    isDev: false,
  });
  const win = new FakeWindowService();
  const settings = new FakeSettingsService();
  const profiles = new FakeProfileService();
  const views = new FakeViewService();
  const notifications = new NotificationService();
  container
    .register(win as any)
    .register(settings as any)
    .register(profiles as any)
    .register(views as any)
    .register(notifications);
  await container.init();
  return { container, bus, win, settings, profiles, views, notifications };
}

describe('NotificationService', () => {
  beforeEach(() => {
    dockMock.setBadge.mockClear();
    notifMock.show.mockClear();
    notifMock.on.mockClear();
    notifMock.lastOpts = null;
  });

  it('broadcasts unread updates on the bus', async () => {
    const { bus, win } = await makeContainer();
    bus.emit('notification:update', { moduleId: 'whatsapp', count: 3 });
    expect(win.messages).toHaveLength(1);
    expect(win.messages[0].payload).toEqual({ moduleId: 'whatsapp', count: 3 });
  });

  it('updates dock badge only on changes', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const { bus } = await makeContainer();
      dockMock.setBadge.mockClear();
      bus.emit('notification:update', { moduleId: 'whatsapp', count: 3 });
      bus.emit('notification:update', { moduleId: 'whatsapp', count: 3 });
      bus.emit('notification:update', { moduleId: 'whatsapp', count: 5 });
      expect(dockMock.setBadge.mock.calls.map((c: any) => c[0])).toEqual(['3', '5']);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('aggregates counts across modules', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const { bus } = await makeContainer();
      dockMock.setBadge.mockClear();
      bus.emit('notification:update', { moduleId: 'whatsapp', count: 2 });
      bus.emit('notification:update', { moduleId: 'telegram', count: 3 });
      const last = dockMock.setBadge.mock.calls.at(-1);
      expect(last?.[0]).toBe('5');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('clears badge when an instance is removed', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const { bus } = await makeContainer();
      bus.emit('notification:update', { moduleId: 'whatsapp', count: 5 });
      dockMock.setBadge.mockClear();
      bus.emit('instance:removed', { instanceId: 'whatsapp' });
      expect(dockMock.setBadge).toHaveBeenCalledWith('');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('all() exposes current counts', async () => {
    const { bus, notifications } = await makeContainer();
    bus.emit('notification:update', { moduleId: 'whatsapp', count: 4 });
    bus.emit('notification:update', { moduleId: 'telegram', count: 1 });
    expect(notifications.all()).toEqual({ whatsapp: 4, telegram: 1 });
  });

  describe('resetCounts', () => {
    it('drops every tracked count and zeros the badge', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      try {
        const { bus, notifications } = await makeContainer();
        bus.emit('notification:update', { moduleId: 'whatsapp', count: 12 });
        bus.emit('notification:update', { moduleId: 'telegram', count: 1 });
        expect(notifications.all()).toEqual({ whatsapp: 12, telegram: 1 });

        dockMock.setBadge.mockClear();
        notifications.resetCounts();

        expect(notifications.all()).toEqual({});
        expect(dockMock.setBadge).toHaveBeenCalledWith('');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('broadcasts UNREAD_UPDATE:0 for every previously-tracked instance', async () => {
      const { bus, win, notifications } = await makeContainer();
      bus.emit('notification:update', { moduleId: 'whatsapp', count: 12 });
      bus.emit('notification:update', { moduleId: 'telegram', count: 1 });

      // Clear prior broadcasts so we only see resetCounts output.
      win.messages.length = 0;
      notifications.resetCounts();

      // Both should have been sent with count: 0.
      const zeros = win.messages.filter((m) => m.payload.count === 0);
      const ids = zeros.map((m) => m.payload.moduleId).sort();
      expect(ids).toEqual(['telegram', 'whatsapp']);
    });
  });

  describe('native notifications', () => {
    it('shows a native notification formatted with the instance name', async () => {
      const { bus, profiles } = await makeContainer();
      profiles.addFakeInstance('whatsapp', 'Work');
      bus.emit('notification:native', {
        instanceId: 'whatsapp',
        title: 'John',
        body: 'Lunch?',
      });
      expect(notifMock.show).toHaveBeenCalled();
      expect(notifMock.lastOpts.title).toBe('Work');
      expect(notifMock.lastOpts.body).toBe('John: Lunch?');
      // No "Nexus" branding in title or subtitle anymore.
      expect(notifMock.lastOpts.subtitle).toBeUndefined();
      // Icon path is set so the notification shows the Nexus logo.
      expect(typeof notifMock.lastOpts.icon).toBe('string');
      expect(notifMock.lastOpts.icon).toMatch(/icon\.png$/);
    });

    it('skips native notifications when the setting is disabled', async () => {
      const { bus, settings, profiles } = await makeContainer();
      settings.state.notificationsEnabled = false;
      profiles.addFakeInstance('whatsapp', 'Work');
      bus.emit('notification:native', {
        instanceId: 'whatsapp',
        title: 'John',
        body: 'Lunch?',
      });
      expect(notifMock.show).not.toHaveBeenCalled();
    });

    it('ignores events for unknown instances', async () => {
      const { bus } = await makeContainer();
      bus.emit('notification:native', {
        instanceId: 'ghost',
        title: 'hi',
        body: 'there',
      });
      expect(notifMock.show).not.toHaveBeenCalled();
    });

    it('click handler focuses window and activates the instance', async () => {
      const { bus, profiles, views, win } = await makeContainer();
      profiles.addFakeInstance('whatsapp', 'Work');
      bus.emit('notification:native', {
        instanceId: 'whatsapp',
        title: 'John',
        body: 'Lunch?',
      });
      const clickCall = notifMock.on.mock.calls.find((c: any) => c[0] === 'click');
      expect(clickCall).toBeTruthy();
      const clickHandler = clickCall![1];
      clickHandler();
      expect(win.win.focus).toHaveBeenCalled();
      expect(views.activate).toHaveBeenCalledWith('whatsapp');
      expect(profiles.state.activeInstanceId).toBe('whatsapp');
    });
  });

  describe('testNotification', () => {
    it('fires a canned notification with the active instance name', async () => {
      const { profiles, notifications } = await makeContainer();
      profiles.addFakeInstance('whatsapp', 'Work');
      profiles.setActive('whatsapp');
      const ok = notifications.testNotification();
      expect(ok).toBe(true);
      expect(notifMock.show).toHaveBeenCalled();
      expect(notifMock.lastOpts.title).toBe('Work');
      expect(notifMock.lastOpts.body).toContain('Test notification');
      expect(notifMock.lastOpts.subtitle).toBeUndefined();
    });

    it('falls back to "Nexus" when no instance exists', async () => {
      const { notifications } = await makeContainer();
      const ok = notifications.testNotification();
      expect(ok).toBe(true);
      // With no instance, the fallback display name is the literal "Nexus".
      expect(notifMock.lastOpts.title).toBe('Nexus');
    });

    it('honors an explicit instanceId hint', async () => {
      const { profiles, notifications } = await makeContainer();
      profiles.addFakeInstance('whatsapp', 'Work');
      profiles.addFakeInstance('telegram', 'Personal');
      profiles.setActive('whatsapp');
      notifications.testNotification('telegram');
      expect(notifMock.lastOpts.title).toBe('Personal');
    });
  });
});
