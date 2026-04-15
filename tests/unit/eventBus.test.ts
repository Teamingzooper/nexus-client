import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/main/core/eventBus';

describe('EventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('module:activated', fn);
    bus.emit('module:activated', { moduleId: 'abc' });
    expect(fn).toHaveBeenCalledWith({ moduleId: 'abc' });
  });

  it('returns an unsubscribe function', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('module:activated', fn);
    off();
    bus.emit('module:activated', { moduleId: 'abc' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates subscribers across events', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('module:enabled', a);
    bus.on('module:disabled', b);
    bus.emit('module:enabled', { moduleId: 'x' });
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('swallows handler errors so siblings still fire', () => {
    const bus = new EventBus();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.on('module:activated', bad);
    bus.on('module:activated', good);
    bus.emit('module:activated', { moduleId: 'x' });
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    err.mockRestore();
  });

  it('clear() removes all subscribers', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('module:activated', fn);
    bus.clear();
    bus.emit('module:activated', { moduleId: 'x' });
    expect(fn).not.toHaveBeenCalled();
  });
});
