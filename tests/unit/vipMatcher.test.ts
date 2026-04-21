import { describe, it, expect } from 'vitest';
import { matchVip, normalizeEmail } from '../../src/main/email/vipMatcher';
import type { VipEntry } from '../../src/shared/types';

const vips: VipEntry[] = [
  { email: 'boss@corp.com', label: 'Boss' },
  { email: 'Mom@Example.com', label: 'Mom', sound: 'glass' },
];

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  BOSS@corp.com  ')).toBe('boss@corp.com');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeEmail('')).toBe('');
  });
});

describe('matchVip', () => {
  it('matches case-insensitive', () => {
    expect(matchVip(vips, 'BOSS@CORP.COM')?.label).toBe('Boss');
  });
  it('matches despite whitespace', () => {
    expect(matchVip(vips, '  mom@example.com ')?.sound).toBe('glass');
  });
  it('returns null for non-match', () => {
    expect(matchVip(vips, 'spam@evil.com')).toBe(null);
  });
  it('returns null for empty sender', () => {
    expect(matchVip(vips, '')).toBe(null);
  });
  it('returns null for empty list', () => {
    expect(matchVip([], 'boss@corp.com')).toBe(null);
  });
});
