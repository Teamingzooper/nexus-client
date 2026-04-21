import { describe, it, expect, beforeEach } from 'vitest';
import { PeekCacheService } from '../../src/main/services/peekCacheService';
import type { PeekItem, VipEntry } from '../../src/shared/types';

function item(overrides: Partial<PeekItem> = {}): PeekItem {
  return {
    messageId: 'm1',
    threadId: 't1',
    from: { name: 'Alice', email: 'alice@example.com' },
    subject: 'Hello',
    snippet: 'Hi there',
    date: '2026-04-21T12:00:00Z',
    unread: true,
    isVip: false,
    ...overrides,
  };
}

describe('PeekCacheService', () => {
  let svc: PeekCacheService;
  let events: Array<{ instanceId: string; items: PeekItem[] }>;
  beforeEach(() => {
    svc = new PeekCacheService();
    events = [];
    svc.onChange((instanceId, items) => events.push({ instanceId, items }));
  });

  it('stores and retrieves items per instance', () => {
    svc.updateVipList([]);
    svc.update('gmail:personal', [item()]);
    expect(svc.getForInstance('gmail:personal')).toHaveLength(1);
  });

  it('emits change events on update', () => {
    svc.updateVipList([]);
    svc.update('gmail:personal', [item()]);
    expect(events).toHaveLength(1);
    expect(events[0].instanceId).toBe('gmail:personal');
  });

  it('does not emit if items are identical', () => {
    svc.updateVipList([]);
    svc.update('gmail:personal', [item()]);
    svc.update('gmail:personal', [item()]);
    expect(events).toHaveLength(1);
  });

  it('computes isVip based on VIP list', () => {
    const vips: VipEntry[] = [{ email: 'alice@example.com' }];
    svc.updateVipList(vips);
    svc.update('gmail:personal', [item()]);
    expect(svc.getForInstance('gmail:personal')[0].isVip).toBe(true);
  });

  it('computes global unread count', () => {
    svc.updateVipList([]);
    svc.update('gmail:personal', [item(), item({ messageId: 'm2', unread: false })]);
    svc.update('outlook:work', [item({ messageId: 'm3' })]);
    expect(svc.globalUnread()).toBe(2);
  });

  it('computes global VIP unread count', () => {
    svc.updateVipList([{ email: 'alice@example.com' }]);
    svc.update('gmail:personal', [
      item(),
      item({ messageId: 'm2', from: { name: 'Bob', email: 'bob@x.com' } }),
    ]);
    expect(svc.globalVipUnread()).toBe(1);
  });

  it('recomputes isVip when VIP list changes', () => {
    svc.updateVipList([]);
    svc.update('gmail:personal', [item()]);
    expect(svc.getForInstance('gmail:personal')[0].isVip).toBe(false);
    svc.updateVipList([{ email: 'alice@example.com' }]);
    expect(svc.getForInstance('gmail:personal')[0].isVip).toBe(true);
  });

  it('clearInstance removes an instance entry', () => {
    svc.updateVipList([]);
    svc.update('gmail:personal', [item()]);
    svc.clearInstance('gmail:personal');
    expect(svc.getForInstance('gmail:personal')).toEqual([]);
  });
});
