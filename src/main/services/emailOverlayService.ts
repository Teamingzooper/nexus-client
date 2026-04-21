import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { EmailData, EmailPeekConfig, VipEntry } from '../../shared/types';
import { normalizeEmail } from '../email/vipMatcher';

export interface EmailOverlayAdapter {
  loadVips(): VipEntry[];
  saveVips(vips: VipEntry[]): void;
  loadPeekConfig(): EmailPeekConfig | undefined;
  savePeekConfig(cfg: EmailPeekConfig): void;
  writeClipboard(text: string): void;
}

/**
 * Owns VIP list state and all email-action IPC handlers. The actual IPC
 * plumbing is wired in IpcService; this service holds the logic and state
 * so it can be unit-tested without Electron.
 *
 * Peek update handling (the overlay → main pipe) lives in PeekCacheService;
 * this service only forwards calls so IpcService has one clear entry point.
 */
export class EmailOverlayService implements Service {
  readonly name = 'emailOverlay';
  private logger: Logger | null = null;
  private adapter: EmailOverlayAdapter | null = null;
  private vips: VipEntry[] = [];
  private peekConfig: EmailPeekConfig | undefined;
  private vipListeners: Array<(vips: VipEntry[]) => void> = [];

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('email-overlay');
    if (!this.adapter) {
      // Harmless default adapter — overridden via configure() during bootstrap.
      this.adapter = {
        loadVips: () => [],
        saveVips: () => {},
        loadPeekConfig: () => undefined,
        savePeekConfig: () => {},
        writeClipboard: () => {},
      };
    }
    this.vips = this.adapter.loadVips();
    this.peekConfig = this.adapter.loadPeekConfig();
  }

  configure(adapter: EmailOverlayAdapter): void {
    this.adapter = adapter;
    this.vips = adapter.loadVips();
    this.peekConfig = adapter.loadPeekConfig();
  }

  listVips(): VipEntry[] {
    return [...this.vips];
  }

  addVip(entry: VipEntry): void {
    const needle = normalizeEmail(entry.email);
    const idx = this.vips.findIndex((v) => normalizeEmail(v.email) === needle);
    if (idx >= 0) {
      this.vips[idx] = { ...entry };
    } else {
      this.vips.push({ ...entry });
    }
    this.adapter?.saveVips([...this.vips]);
    this.notifyVipListeners();
  }

  removeVip(email: string): void {
    const needle = normalizeEmail(email);
    const next = this.vips.filter((v) => normalizeEmail(v.email) !== needle);
    if (next.length === this.vips.length) return;
    this.vips = next;
    this.adapter?.saveVips([...this.vips]);
    this.notifyVipListeners();
  }

  onVipListChange(fn: (vips: VipEntry[]) => void): () => void {
    this.vipListeners.push(fn);
    return () => {
      const i = this.vipListeners.indexOf(fn);
      if (i >= 0) this.vipListeners.splice(i, 1);
    };
  }

  copyEmailAsJson(data: EmailData): void {
    const text = JSON.stringify(data, null, 2);
    this.adapter?.writeClipboard(text);
    this.logger?.info('copied email as JSON', { subject: data.subject, provider: data.provider });
  }

  getPeekConfig(): EmailPeekConfig {
    return this.peekConfig ?? { visible: 'always', perAccount: 5, grouping: 'by-account' };
  }

  setPeekConfig(cfg: EmailPeekConfig): void {
    this.peekConfig = cfg;
    this.adapter?.savePeekConfig(cfg);
  }

  private notifyVipListeners(): void {
    for (const fn of this.vipListeners) {
      try { fn([...this.vips]); } catch (err) { this.logger?.warn('vip listener threw', err); }
    }
  }
}
