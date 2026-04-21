import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { PeekItem, VipEntry } from '../../shared/types';
import { matchVip } from '../email/vipMatcher';

type Listener = (instanceId: string, items: PeekItem[]) => void;

/**
 * In-memory cache of peek (inbox summary) data per email instance.
 * Items are keyed by instance id (not module id) because a single module
 * like Gmail may have multiple instances (work, personal, etc.).
 *
 * VIP flags are computed here — overlay scripts don't know which senders
 * are VIPs; they just report raw items and this service enriches.
 */
export class PeekCacheService implements Service {
  readonly name = 'peekCache';
  private logger: Logger | null = null;
  private data = new Map<string, PeekItem[]>();
  private vips: VipEntry[] = [];
  private listeners: Listener[] = [];

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('peek-cache');
  }

  updateVipList(vips: VipEntry[]): void {
    this.vips = vips;
    // Recompute isVip for every cached item, emit for any instance whose items changed.
    for (const [instanceId, items] of this.data.entries()) {
      const recomputed = items.map((it) => ({ ...it, isVip: matchVip(this.vips, it.from.email) !== null }));
      if (!this.itemsEqual(items, recomputed)) {
        this.data.set(instanceId, recomputed);
        this.emit(instanceId, recomputed);
      }
    }
  }

  update(instanceId: string, rawItems: PeekItem[]): void {
    const enriched = rawItems.map((it) => ({
      ...it,
      isVip: matchVip(this.vips, it.from.email) !== null,
    }));
    const prev = this.data.get(instanceId) ?? [];
    if (this.itemsEqual(prev, enriched)) return;
    this.data.set(instanceId, enriched);
    this.emit(instanceId, enriched);
  }

  clearInstance(instanceId: string): void {
    if (!this.data.has(instanceId)) return;
    this.data.delete(instanceId);
    this.emit(instanceId, []);
  }

  getForInstance(instanceId: string): PeekItem[] {
    return this.data.get(instanceId) ?? [];
  }

  getAll(): Record<string, PeekItem[]> {
    const out: Record<string, PeekItem[]> = {};
    for (const [id, items] of this.data.entries()) out[id] = items;
    return out;
  }

  globalUnread(): number {
    let total = 0;
    for (const items of this.data.values()) {
      for (const it of items) if (it.unread) total++;
    }
    return total;
  }

  globalVipUnread(): number {
    let total = 0;
    for (const items of this.data.values()) {
      for (const it of items) if (it.unread && it.isVip) total++;
    }
    return total;
  }

  onChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private emit(instanceId: string, items: PeekItem[]): void {
    for (const fn of this.listeners) {
      try { fn(instanceId, items); } catch (err) { this.logger?.warn('peek listener threw', err); }
    }
  }

  private itemsEqual(a: PeekItem[], b: PeekItem[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (
        x.messageId !== y.messageId ||
        x.threadId !== y.threadId ||
        x.from.email !== y.from.email ||
        x.subject !== y.subject ||
        x.snippet !== y.snippet ||
        x.date !== y.date ||
        x.unread !== y.unread ||
        x.isVip !== y.isVip
      ) return false;
    }
    return true;
  }
}
