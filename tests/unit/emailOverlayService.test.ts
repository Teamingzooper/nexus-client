import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailOverlayService } from '../../src/main/services/emailOverlayService';
import type { VipEntry, EmailPeekConfig } from '../../src/shared/types';

function makeSvc(): { svc: EmailOverlayService; writes: Array<{ vips: VipEntry[]; peek: EmailPeekConfig | undefined }> } {
  const writes: Array<{ vips: VipEntry[]; peek: EmailPeekConfig | undefined }> = [];
  const svc = new EmailOverlayService();
  let vips: VipEntry[] = [];
  let peek: EmailPeekConfig | undefined = undefined;
  svc.configure({
    loadVips: () => [...vips],
    saveVips: (v) => { vips = [...v]; writes.push({ vips, peek }); },
    loadPeekConfig: () => peek,
    savePeekConfig: (p) => { peek = p; writes.push({ vips, peek }); },
    writeClipboard: vi.fn(),
  });
  return { svc, writes };
}

describe('EmailOverlayService', () => {
  let svc: EmailOverlayService;
  let writes: ReturnType<typeof makeSvc>['writes'];
  beforeEach(() => {
    const made = makeSvc();
    svc = made.svc;
    writes = made.writes;
  });

  it('listVips returns loaded list', () => {
    expect(svc.listVips()).toEqual([]);
  });

  it('addVip persists and dedupes case-insensitively', () => {
    svc.addVip({ email: 'Boss@Corp.com', label: 'Boss' });
    svc.addVip({ email: 'boss@corp.com', label: 'Duplicate' });
    const list = svc.listVips();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Duplicate');
    expect(writes.length).toBe(2);
  });

  it('removeVip is case-insensitive', () => {
    svc.addVip({ email: 'boss@corp.com' });
    svc.removeVip('BOSS@corp.com');
    expect(svc.listVips()).toEqual([]);
  });

  it('copyEmailAsJson writes pretty-printed JSON to clipboard', () => {
    const clip = vi.fn();
    svc.configure({
      loadVips: () => [],
      saveVips: () => {},
      loadPeekConfig: () => undefined,
      savePeekConfig: () => {},
      writeClipboard: clip,
    });
    svc.copyEmailAsJson({
      provider: 'gmail',
      account: 'me@gmail.com',
      messageId: null,
      threadId: null,
      date: '2026-04-21T00:00:00Z',
      from: { name: 'A', email: 'a@x.com' },
      to: [], cc: [], bcc: [],
      subject: 'Hi',
      bodyText: 'hello',
      bodyHtml: '<p>hello</p>',
      labels: [],
      attachments: [],
    });
    expect(clip).toHaveBeenCalledOnce();
    const written = clip.mock.calls[0][0] as string;
    expect(written).toContain('"provider": "gmail"');
    expect(written).toContain('"subject": "Hi"');
  });

  it('setPeekConfig persists', () => {
    svc.setPeekConfig({ visible: 'hover', perAccount: 10, grouping: 'unified' });
    expect(svc.getPeekConfig()).toEqual({ visible: 'hover', perAccount: 10, grouping: 'unified' });
  });
});
