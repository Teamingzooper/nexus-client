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
    activeInstanceId: null as string | null,
    instances: [] as Array<{ id: string; moduleId: string; name: string }>,
    themeId: 'nexus-dark',
    notificationsEnabled: true as boolean,
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
  const views = new FakeViewService();
  const notifications = new NotificationService();
  container
    .register(win as any)
    .register(settings as any)
    .register(views as any)
    .register(notifications);
  await container.init();
  return { container, bus, win, settings, views, notifications };
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

  describe('native notifications', () => {
    it('shows a native notification formatted with the instance name', async () => {
      const { bus, settings } = await makeContainer();
      settings.addFakeInstance('whatsapp', 'Work');
      bus.emit('notification:native', {
        instanceId: 'whatsapp',
        title: 'John',
        body: 'Lunch?',
      });
      expect(notifMock.show).toHaveBeenCalled();
      expect(notifMock.lastOpts.title).toBe('[Nexus] Work');
      expect(notifMock.lastOpts.body).toBe('John: Lunch?');
    });

    it('skips native notifications when the setting is disabled', async () => {
      const { bus, settings } = await makeContainer();
      settings.state.notificationsEnabled = false;
      settings.addFakeInstance('whatsapp', 'Work');
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
      const { bus, settings, views, win } = await makeContainer();
      settings.addFakeInstance('whatsapp', 'Work');
      bus.emit('notification:native', {
        instanceId: 'whatsapp',
        title: 'John',
        body: 'Lunch?',
      });
      // Capture the click handler and invoke it.
      const clickCall = notifMock.on.mock.calls.find((c: any) => c[0] === 'click');
      expect(clickCall).toBeTruthy();
      const clickHandler = clickCall![1];
      clickHandler();
      expect(win.win.focus).toHaveBeenCalled();
      expect(views.activate).toHaveBeenCalledWith('whatsapp');
      expect(settings.state.activeInstanceId).toBe('whatsapp');
    });
  });

  describe('testNotification', () => {
    it('fires a canned notification with the active instance name', async () => {
      const { settings, notifications } = await makeContainer();
      settings.addFakeInstance('whatsapp', 'Work');
      settings.setActive('whatsapp');
      const ok = notifications.testNotification();
      expect(ok).toBe(true);
      expect(notifMock.show).toHaveBeenCalled();
      expect(notifMock.lastOpts.title).toBe('[Nexus] Work');
      expect(notifMock.lastOpts.body).toContain('Test notification');
    });

    it('falls back to "Nexus" when no instance exists', async () => {
      const { notifications } = await makeContainer();
      const ok = notifications.testNotification();
      expect(ok).toBe(true);
      expect(notifMock.lastOpts.title).toBe('[Nexus] Nexus');
    });

    it('honors an explicit instanceId hint', async () => {
      const { settings, notifications } = await makeContainer();
      settings.addFakeInstance('whatsapp', 'Work');
      settings.addFakeInstance('telegram', 'Personal');
      settings.setActive('whatsapp');
      notifications.testNotification('telegram');
      expect(notifMock.lastOpts.title).toBe('[Nexus] Personal');
    });
  });
});
