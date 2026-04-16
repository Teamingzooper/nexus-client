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

import {
  formatNativeNotification,
  isInDndWindow,
} from '../../src/main/services/notificationService';

describe('formatNativeNotification', () => {
  it('uses the instance name verbatim as the title (no [Nexus] prefix)', () => {
    const out = formatNativeNotification({
      instanceName: 'Work',
      title: 'John Doe',
      body: 'Lunch?',
    });
    expect(out.title).toBe('Work');
    // Belt-and-suspenders: explicitly assert no leftover Nexus branding.
    expect(out.title).not.toContain('Nexus');
    expect(out.title).not.toContain('[');
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
    expect(out.title).toBe('Работа');
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

  it('redacts body to "New message" in privacy mode', () => {
    const out = formatNativeNotification({
      instanceName: 'Personal',
      title: 'Mom',
      body: 'Pick up some milk and call grandma',
      privacyMode: true,
    });
    expect(out.title).toBe('Personal');
    expect(out.body).toBe('New message');
    expect(out.body).not.toContain('milk');
    expect(out.body).not.toContain('grandma');
  });
});

describe('isInDndWindow', () => {
  function at(h: number, m = 0): Date {
    const d = new Date(2026, 0, 1, h, m);
    return d;
  }

  it('returns false when start equals end', () => {
    expect(isInDndWindow(at(12), '12:00', '12:00')).toBe(false);
  });

  it('returns false on malformed time strings', () => {
    expect(isInDndWindow(at(12), 'noon', 'midnight')).toBe(false);
    expect(isInDndWindow(at(12), '25:00', '08:00')).toBe(false);
  });

  it('handles same-day windows (12:00 → 13:30)', () => {
    expect(isInDndWindow(at(12, 30), '12:00', '13:30')).toBe(true);
    expect(isInDndWindow(at(13, 30), '12:00', '13:30')).toBe(false); // end is exclusive
    expect(isInDndWindow(at(11, 59), '12:00', '13:30')).toBe(false);
    expect(isInDndWindow(at(14, 0), '12:00', '13:30')).toBe(false);
  });

  it('handles wraparound windows (22:00 → 08:00)', () => {
    expect(isInDndWindow(at(22, 0), '22:00', '08:00')).toBe(true);
    expect(isInDndWindow(at(23, 30), '22:00', '08:00')).toBe(true);
    expect(isInDndWindow(at(2, 0), '22:00', '08:00')).toBe(true);
    expect(isInDndWindow(at(7, 59), '22:00', '08:00')).toBe(true);
    expect(isInDndWindow(at(8, 0), '22:00', '08:00')).toBe(false);
    expect(isInDndWindow(at(12, 0), '22:00', '08:00')).toBe(false);
    expect(isInDndWindow(at(21, 59), '22:00', '08:00')).toBe(false);
  });
});
