import { describe, it, expect } from 'vitest';
import {
  manifestSchema,
  themeSchema,
  themeColorsSchema,
  boundsSchema,
  moduleIdSchema,
  appStateSchema,
} from '../../src/shared/schemas';

describe('manifestSchema', () => {
  const valid = {
    id: 'whatsapp',
    name: 'WhatsApp',
    version: '1.0.0',
    url: 'https://web.whatsapp.com',
  };

  it('accepts a minimal valid manifest', () => {
    const res = manifestSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('rejects non-https urls', () => {
    const res = manifestSchema.safeParse({ ...valid, url: 'http://example.com' });
    expect(res.success).toBe(false);
  });

  it('rejects invalid ids', () => {
    expect(manifestSchema.safeParse({ ...valid, id: 'WhatsApp' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid, id: '../hack' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid, id: '-bad' }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid, id: '' }).success).toBe(false);
  });

  it('rejects inject paths with ..', () => {
    const res = manifestSchema.safeParse({
      ...valid,
      inject: { css: '../escape.css' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects icons with ..', () => {
    const res = manifestSchema.safeParse({ ...valid, icon: '../../secret.png' });
    expect(res.success).toBe(false);
  });

  it('accepts all notification strategy kinds', () => {
    for (const n of [
      { kind: 'dom' as const, selector: '.x' },
      { kind: 'title' as const, pattern: '\\((\\d+)\\)' },
      { kind: 'custom' as const },
      { kind: 'none' as const },
    ]) {
      expect(manifestSchema.safeParse({ ...valid, notifications: n }).success).toBe(true);
    }
  });

  it('rejects malformed notification strategy', () => {
    const res = manifestSchema.safeParse({
      ...valid,
      notifications: { kind: 'dom' }, // missing selector
    });
    expect(res.success).toBe(false);
  });

  it('rejects partition not starting with persist:', () => {
    const res = manifestSchema.safeParse({ ...valid, partition: 'transient' });
    expect(res.success).toBe(false);
  });

  it('accepts a manifest with emailProvider "gmail"', () => {
    const res = manifestSchema.safeParse({ ...valid, emailProvider: 'gmail' });
    expect(res.success).toBe(true);
  });

  it('accepts a manifest with emailProvider "outlook"', () => {
    const res = manifestSchema.safeParse({ ...valid, emailProvider: 'outlook' });
    expect(res.success).toBe(true);
  });

  it('rejects unknown emailProvider values', () => {
    const res = manifestSchema.safeParse({ ...valid, emailProvider: 'yahoo' });
    expect(res.success).toBe(false);
  });

  it('accepts a manifest with no emailProvider (chat module)', () => {
    const res = manifestSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });
});

describe('themeSchema', () => {
  const colors = {
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
  };

  it('accepts valid theme', () => {
    const res = themeSchema.safeParse({ id: 'a', name: 'A', colors });
    expect(res.success).toBe(true);
  });

  it('rejects non-hex color', () => {
    const res = themeColorsSchema.safeParse({ ...colors, bg: 'rgb(0,0,0)' });
    expect(res.success).toBe(false);
  });

  it('accepts 3/6/8 char hex', () => {
    expect(themeColorsSchema.safeParse({ ...colors, bg: '#fff' }).success).toBe(true);
    expect(themeColorsSchema.safeParse({ ...colors, bg: '#ffffff' }).success).toBe(true);
    expect(themeColorsSchema.safeParse({ ...colors, bg: '#ffffff80' }).success).toBe(true);
  });
});

describe('boundsSchema', () => {
  it('accepts positive integer bounds', () => {
    expect(boundsSchema.safeParse({ x: 0, y: 0, width: 100, height: 200 }).success).toBe(
      true,
    );
  });

  it('rejects negative values', () => {
    expect(boundsSchema.safeParse({ x: -1, y: 0, width: 10, height: 10 }).success).toBe(
      false,
    );
  });

  it('rejects non-integers', () => {
    expect(boundsSchema.safeParse({ x: 0, y: 0, width: 1.5, height: 2 }).success).toBe(
      false,
    );
  });
});

describe('moduleIdSchema', () => {
  it('accepts valid ids', () => {
    for (const id of ['a', 'abc', 'a-b-c', 'a_b', 'a1']) {
      expect(moduleIdSchema.safeParse(id).success).toBe(true);
    }
  });
  it('rejects invalid ids', () => {
    for (const id of ['A', '-a', '../x', '']) {
      expect(moduleIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe('appStateSchema', () => {
  it('accepts defaults', () => {
    const res = appStateSchema.safeParse({
      themeId: 'nexus-dark',
      activeProfileId: null,
    });
    expect(res.success).toBe(true);
  });

  it('accepts activeProfileId and window state', () => {
    const res = appStateSchema.safeParse({
      themeId: 'nexus-dark',
      activeProfileId: 'work',
      windowState: { width: 1200, height: 800, maximized: true },
    });
    expect(res.success).toBe(true);
  });
});

describe('appStateSchema email & hotkeys', () => {
  const minimal = {
    themeId: 'nexus-dark',
    activeProfileId: null,
  };

  it('accepts settings without email or hotkeys sections', () => {
    expect(appStateSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a valid email section', () => {
    const res = appStateSchema.safeParse({
      ...minimal,
      email: {
        vips: [{ email: 'boss@corp.com', label: 'Boss', sound: 'glass' }],
        peek: { visible: 'always', perAccount: 5, grouping: 'by-account' },
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects invalid peek.visible enum', () => {
    const res = appStateSchema.safeParse({
      ...minimal,
      email: { peek: { visible: 'sometimes', perAccount: 5, grouping: 'by-account' } },
    });
    expect(res.success).toBe(false);
  });

  it('clamps peek.perAccount out of range by rejecting', () => {
    const res = appStateSchema.safeParse({
      ...minimal,
      email: { peek: { visible: 'always', perAccount: 999, grouping: 'by-account' } },
    });
    expect(res.success).toBe(false);
  });

  it('accepts a hotkeys map', () => {
    const res = appStateSchema.safeParse({
      ...minimal,
      hotkeys: { 'email.copyAsJson': 'Cmd+Shift+C' },
    });
    expect(res.success).toBe(true);
  });

  it('rejects non-string hotkey binding values', () => {
    const res = appStateSchema.safeParse({
      ...minimal,
      hotkeys: { 'email.copyAsJson': 123 },
    });
    expect(res.success).toBe(false);
  });
});
