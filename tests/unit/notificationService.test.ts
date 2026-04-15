import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dockMock } = vi.hoisted(() => ({ dockMock: { setBadge: vi.fn() } }));
vi.mock('electron', () => ({
  app: { dock: dockMock },
  BrowserWindow: class {},
}));

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
  const notifications = new NotificationService();
  container.register(win as any).register(notifications);
  await container.init();
  return { container, bus, win, notifications };
}

describe('NotificationService', () => {
  beforeEach(() => {
    dockMock.setBadge.mockClear();
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
});
