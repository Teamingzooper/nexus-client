import type { VipEntry } from '../../shared/types';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchVip(vips: VipEntry[], senderEmail: string): VipEntry | null {
  const needle = normalizeEmail(senderEmail);
  if (!needle) return null;
  for (const v of vips) {
    if (normalizeEmail(v.email) === needle) return v;
  }
  return null;
}
