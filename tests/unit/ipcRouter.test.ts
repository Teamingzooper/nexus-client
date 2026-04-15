import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const handlers = new Map<string, (event: any, payload: unknown) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: any) => {
      handlers.set(channel, fn);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  },
}));

import { IpcRouter } from '../../src/main/core/ipcRouter';
import { Logger } from '../../src/main/core/logger';

describe('IpcRouter', () => {
  let router: IpcRouter;
  beforeEach(() => {
    handlers.clear();
    router = new IpcRouter(new Logger('ipc-test', 'error'));
  });

  async function call(channel: string, payload?: unknown): Promise<any> {
    const fn = handlers.get(channel);
    if (!fn) throw new Error(`no handler for ${channel}`);
    return fn({}, payload);
  }

  it('returns ok envelope on success', async () => {
    router.register('echo', {
      input: z.string(),
      handler: (s) => s.toUpperCase(),
    });
    const res = await call('echo', 'hello');
    expect(res).toEqual({ ok: true, data: 'HELLO' });
  });

  it('returns error envelope on schema mismatch', async () => {
    router.register('int', {
      input: z.number().int(),
      handler: (n) => n * 2,
    });
    const res = await call('int', 'not a number');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid input/);
  });

  it('wraps handler exceptions in error envelope', async () => {
    router.register('boom', {
      handler: () => {
        throw new Error('kaboom');
      },
    });
    const res = await call('boom');
    expect(res).toEqual({ ok: false, error: 'kaboom' });
  });

  it('handles async handlers', async () => {
    router.register('async', {
      handler: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 42;
      },
    });
    const res = await call('async');
    expect(res).toEqual({ ok: true, data: 42 });
  });

  it('refuses duplicate channel registration', () => {
    router.register('dup', { handler: () => 1 });
    expect(() => router.register('dup', { handler: () => 2 })).toThrow(/already registered/);
  });

  it('dispose removes all handlers', () => {
    router.register('a', { handler: () => 1 });
    router.register('b', { handler: () => 2 });
    expect(handlers.size).toBe(2);
    router.dispose();
    expect(handlers.size).toBe(0);
  });

  it('allows calls without input schema', async () => {
    router.register('noinput', { handler: () => 'ok' });
    const res = await call('noinput');
    expect(res).toEqual({ ok: true, data: 'ok' });
  });
});
