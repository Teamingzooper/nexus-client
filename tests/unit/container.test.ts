import { describe, it, expect, vi } from 'vitest';
import { ServiceContainer, type Service, type ServiceContext } from '../../src/main/core/service';
import { Logger } from '../../src/main/core/logger';
import { EventBus } from '../../src/main/core/eventBus';

function makeContainer(): ServiceContainer {
  return new ServiceContainer({
    logger: new Logger('test', 'error'),
    bus: new EventBus(),
    userData: '/tmp/nexus-test',
    appPath: '/tmp/nexus-test-app',
    isDev: false,
  });
}

class TrackerService implements Service {
  initCalled = false;
  disposeCalled = false;
  constructor(public readonly name: string) {}
  init(_ctx: ServiceContext): void {
    this.initCalled = true;
  }
  dispose(): void {
    this.disposeCalled = true;
  }
}

describe('ServiceContainer', () => {
  it('initializes services in registration order', async () => {
    const c = makeContainer();
    const order: string[] = [];
    const a: Service = { name: 'a', init: () => { order.push('a'); } };
    const b: Service = { name: 'b', init: () => { order.push('b'); } };
    c.register(a).register(b);
    await c.init();
    expect(order).toEqual(['a', 'b']);
  });

  it('disposes services in reverse order', async () => {
    const c = makeContainer();
    const order: string[] = [];
    const a: Service = { name: 'a', init: () => {}, dispose: () => { order.push('a'); } };
    const b: Service = { name: 'b', init: () => {}, dispose: () => { order.push('b'); } };
    c.register(a).register(b);
    await c.init();
    await c.dispose();
    expect(order).toEqual(['b', 'a']);
  });

  it('get() returns the registered service', async () => {
    const c = makeContainer();
    const svc = new TrackerService('tracker');
    c.register(svc);
    await c.init();
    expect(c.get('tracker')).toBe(svc);
    expect(svc.initCalled).toBe(true);
  });

  it('throws when fetching unknown service', async () => {
    const c = makeContainer();
    await c.init();
    expect(() => c.get('missing')).toThrow(/service not found/);
  });

  it('rejects duplicate service names', () => {
    const c = makeContainer();
    c.register({ name: 'a', init: () => {} });
    expect(() => c.register({ name: 'a', init: () => {} })).toThrow(/already registered/);
  });

  it('rejects registration after init', async () => {
    const c = makeContainer();
    await c.init();
    expect(() => c.register({ name: 'late', init: () => {} })).toThrow(/after container is initialized/);
  });

  it('continues dispose when one service throws', async () => {
    const c = makeContainer();
    const a: Service = { name: 'a', init: () => {}, dispose: () => { throw new Error('boom'); } };
    const bDispose = vi.fn();
    const b: Service = { name: 'b', init: () => {}, dispose: bDispose };
    c.register(a).register(b);
    await c.init();
    await c.dispose();
    expect(bDispose).toHaveBeenCalled();
  });
});
