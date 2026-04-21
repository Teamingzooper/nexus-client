import { describe, it, expect, beforeEach } from 'vitest';
import { HotkeyRegistryService } from '../../src/main/services/hotkeyRegistryService';

function makeSvc(): HotkeyRegistryService {
  const svc = new HotkeyRegistryService();
  // Inject a fake persist/load: store in memory
  let store: Record<string, string> = {};
  svc.configure({
    load: () => ({ ...store }),
    save: (bindings) => { store = { ...bindings }; },
  });
  return svc;
}

describe('HotkeyRegistryService', () => {
  let svc: HotkeyRegistryService;
  beforeEach(() => { svc = makeSvc(); });

  it('registers an action with a default binding', () => {
    svc.register({
      id: 'email.copyAsJson',
      label: 'Copy email as JSON',
      defaultBinding: 'Cmd+Shift+C',
    });
    const list = svc.list();
    expect(list).toHaveLength(1);
    expect(list[0].currentBinding).toBe('Cmd+Shift+C');
  });

  it('rejects duplicate registration', () => {
    svc.register({ id: 'a', label: 'A', defaultBinding: null });
    expect(() => svc.register({ id: 'a', label: 'A', defaultBinding: null }))
      .toThrow(/already registered/);
  });

  it('rebinds an action and persists', () => {
    svc.register({ id: 'a', label: 'A', defaultBinding: 'Cmd+A' });
    const res = svc.rebind('a', 'Cmd+B');
    expect(res.ok).toBe(true);
    expect(svc.list()[0].currentBinding).toBe('Cmd+B');
  });

  it('detects binding conflicts', () => {
    svc.register({ id: 'a', label: 'A', defaultBinding: 'Cmd+A' });
    svc.register({ id: 'b', label: 'B', defaultBinding: 'Cmd+B' });
    const res = svc.rebind('b', 'Cmd+A');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.conflictingActionId).toBe('a');
  });

  it('resolves a chord to an action id', () => {
    svc.register({ id: 'email.copyAsJson', label: 'Copy', defaultBinding: 'Cmd+Shift+C' });
    expect(svc.resolveChord('Cmd+Shift+C')).toBe('email.copyAsJson');
    expect(svc.resolveChord('Cmd+Shift+X')).toBe(null);
  });

  it('resets an action to its default', () => {
    svc.register({ id: 'a', label: 'A', defaultBinding: 'Cmd+A' });
    svc.rebind('a', 'Cmd+Z');
    svc.reset('a');
    expect(svc.list()[0].currentBinding).toBe('Cmd+A');
  });

  it('unbinds when rebind is called with null', () => {
    svc.register({ id: 'a', label: 'A', defaultBinding: 'Cmd+A' });
    svc.rebind('a', null);
    expect(svc.list()[0].currentBinding).toBe(null);
    expect(svc.resolveChord('Cmd+A')).toBe(null);
  });
});
