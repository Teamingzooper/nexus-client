import { bench, describe } from 'vitest';
import { EventBus } from '../../src/main/core/eventBus';
import { Logger } from '../../src/main/core/logger';
import { ServiceContainer } from '../../src/main/core/service';
import { manifestSchema, themeSchema } from '../../src/shared/schemas';

const validManifest = {
  id: 'whatsapp',
  name: 'WhatsApp',
  version: '1.0.0',
  url: 'https://web.whatsapp.com',
  icon: 'icon.svg',
  inject: { preload: 'preload.js' },
  notifications: { kind: 'custom' as const },
};

const validTheme = {
  id: 'bench-theme',
  name: 'Bench',
  colors: {
    bg: '#000000',
    sidebar: '#111111',
    sidebarHover: '#222222',
    accent: '#3366ff',
    accentFg: '#ffffff',
    text: '#eeeeee',
    textMuted: '#999999',
    border: '#333333',
    badge: '#ff0000',
    badgeFg: '#ffffff',
  },
};

describe('manifest validation', () => {
  bench('manifestSchema.parse — valid', () => {
    manifestSchema.parse(validManifest);
  });
  bench('manifestSchema.safeParse — valid', () => {
    manifestSchema.safeParse(validManifest);
  });
});

describe('theme validation', () => {
  bench('themeSchema.parse', () => {
    themeSchema.parse(validTheme);
  });
});

describe('event bus', () => {
  bench('emit with 0 listeners', () => {
    const bus = new EventBus();
    bus.emit('module:activated', { moduleId: 'x' });
  });

  bench('emit with 10 listeners', () => {
    const bus = new EventBus();
    for (let i = 0; i < 10; i++) bus.on('module:activated', () => {});
    bus.emit('module:activated', { moduleId: 'x' });
  });

  bench('subscribe/unsubscribe', () => {
    const bus = new EventBus();
    const off = bus.on('module:activated', () => {});
    off();
  });
});

describe('container lifecycle', () => {
  bench('register + init 5 services', async () => {
    const c = new ServiceContainer({
      logger: new Logger('bench', 'error'),
      bus: new EventBus(),
      userData: '/tmp/nexus-bench',
      appPath: '/tmp/nexus-bench',
      isDev: false,
    });
    for (let i = 0; i < 5; i++) {
      c.register({ name: `svc${i}`, init: () => {} });
    }
    await c.init();
  });
});
