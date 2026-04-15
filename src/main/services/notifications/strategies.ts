import type { NotificationStrategy, StrategyContext, StrategyFactory } from './strategy';
import type { NotificationStrategySpec } from '../../../shared/types';

export class TitleStrategy implements NotificationStrategy {
  readonly kind = 'title';
  private handler?: (e: unknown, title: string) => void;
  private ctx?: StrategyContext;

  constructor(private pattern: string) {}

  attach(ctx: StrategyContext): void {
    this.ctx = ctx;
    const regex = new RegExp(this.pattern);
    this.handler = (_e, title: string) => {
      const match = title.match(regex);
      const count = match ? parseInt(match[1] ?? '0', 10) : 0;
      ctx.emit(Number.isFinite(count) ? count : 0);
    };
    ctx.webContents.on('page-title-updated', this.handler as any);
    // Report current title immediately.
    const current = ctx.webContents.getTitle();
    if (current) this.handler(null, current);
  }

  detach(): void {
    if (this.handler && this.ctx) {
      this.ctx.webContents.removeListener('page-title-updated', this.handler as any);
    }
    this.handler = undefined;
    this.ctx = undefined;
  }
}

export class DomStrategy implements NotificationStrategy {
  readonly kind = 'dom';
  private ctx?: StrategyContext;
  private interval?: NodeJS.Timeout;

  constructor(
    private selector: string,
    private parse: 'int' | 'text' = 'int',
  ) {}

  attach(ctx: StrategyContext): void {
    this.ctx = ctx;
    const sel = this.selector.replace(/['\\]/g, (c) => `\\${c}`);
    const poll = async () => {
      if (!this.ctx) return;
      try {
        const js = `(() => {
          const el = document.querySelector('${sel}');
          if (!el) return { count: 0 };
          const t = (el.textContent || '').trim();
          return { count: t, text: t };
        })()`;
        const result = (await ctx.webContents.executeJavaScript(js, true)) as {
          count: string;
          text?: string;
        };
        let count = 0;
        if (this.parse === 'int') {
          const n = parseInt(String(result.count || '0'), 10);
          count = Number.isFinite(n) ? n : 0;
        } else {
          const n = (result.text || '').length > 0 ? 1 : 0;
          count = n;
        }
        ctx.emit(count, typeof result.text === 'string' ? result.text : undefined);
      } catch {
        // page may not be ready
      }
    };
    // Poll every 2s — cheap and the dom strategy is fallback-of-last-resort.
    this.interval = setInterval(poll, 2000);
    ctx.webContents.once('dom-ready', poll);
  }

  detach(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    this.ctx = undefined;
  }
}

export class CustomStrategy implements NotificationStrategy {
  readonly kind = 'custom';
  private ctx?: StrategyContext;
  private handler?: (_e: unknown, count: unknown, preview?: unknown) => void;

  attach(ctx: StrategyContext): void {
    this.ctx = ctx;
    this.handler = (_e, count: unknown, preview?: unknown) => {
      if (typeof count !== 'number' || count < 0 || !Number.isFinite(count)) return;
      ctx.emit(
        Math.floor(count),
        typeof preview === 'string' ? preview.slice(0, 280) : undefined,
      );
    };
    ctx.webContents.ipc.on('nexus:unread', this.handler as any);
  }

  detach(): void {
    if (this.handler && this.ctx) {
      this.ctx.webContents.ipc.removeListener('nexus:unread', this.handler as any);
    }
    this.handler = undefined;
    this.ctx = undefined;
  }
}

export class NoneStrategy implements NotificationStrategy {
  readonly kind = 'none';
  attach(): void {}
  detach(): void {}
}

export class DefaultStrategyFactory implements StrategyFactory {
  create(spec: NotificationStrategySpec): NotificationStrategy {
    switch (spec.kind) {
      case 'title':
        return new TitleStrategy(spec.pattern ?? '\\((\\d+)\\)');
      case 'dom':
        return new DomStrategy(spec.selector, spec.parse ?? 'int');
      case 'custom':
        return new CustomStrategy();
      case 'none':
      default:
        return new NoneStrategy();
    }
  }
}
