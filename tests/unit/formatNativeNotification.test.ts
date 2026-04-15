import { describe, it, expect, vi } from 'vitest';

// formatNativeNotification is exported from notificationService, which imports
// from 'electron' at top level. Mock electron before importing.
vi.mock('electron', () => ({
  app: { dock: { setBadge: vi.fn() } },
  BrowserWindow: class {},
  Notification: class {
    static isSupported() {
      return true;
    }
    constructor(_opts: unknown) {}
    on() {}
    show() {}
  },
}));

import { formatNativeNotification } from '../../src/main/services/notificationService';

describe('formatNativeNotification', () => {
  it('prefixes title with [Nexus] and the instance name', () => {
    const out = formatNativeNotification({
      instanceName: 'Work',
      title: 'John Doe',
      body: 'Lunch?',
    });
    expect(out.title).toBe('[Nexus] Work');
  });

  it('joins title and body with ": " when both present', () => {
    const out = formatNativeNotification({
      instanceName: 'Personal',
      title: 'Mom',
      body: 'Call me back',
    });
    expect(out.body).toBe('Mom: Call me back');
  });

  it('uses body alone when title is empty', () => {
    const out = formatNativeNotification({
      instanceName: 'Work',
      title: '',
      body: 'Ping from server',
    });
    expect(out.body).toBe('Ping from server');
  });

  it('uses title alone when body is empty', () => {
    const out = formatNativeNotification({
      instanceName: 'Work',
      title: 'New message',
      body: '',
    });
    expect(out.body).toBe('New message');
  });

  it('returns empty body when both title and body are empty', () => {
    const out = formatNativeNotification({
      instanceName: 'Work',
      title: '',
      body: '',
    });
    expect(out.body).toBe('');
  });

  it('trims whitespace on title and body', () => {
    const out = formatNativeNotification({
      instanceName: 'Work',
      title: '  Alice  ',
      body: '  hi there  ',
    });
    expect(out.body).toBe('Alice: hi there');
  });

  it('handles unicode in both name and content', () => {
    const out = formatNativeNotification({
      instanceName: 'Работа',
      title: '🎉',
      body: 'Party time',
    });
    expect(out.title).toBe('[Nexus] Работа');
    expect(out.body).toBe('🎉: Party time');
  });

  it('always returns a defined title and body', () => {
    const out = formatNativeNotification({
      instanceName: '',
      title: '',
      body: '',
    });
    expect(typeof out.title).toBe('string');
    expect(typeof out.body).toBe('string');
  });
});
