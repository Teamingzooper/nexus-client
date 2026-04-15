import * as fs from 'fs/promises';
import * as path from 'path';
import { appStateSchema } from '../../shared/schemas';
import type { AppState, SidebarLayout } from '../../shared/types';
import { defaultLayout, reconcile } from '../../shared/sidebarLayout';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';

const DEFAULT_STATE: AppState = {
  activeModuleId: null,
  enabledModuleIds: [],
  themeId: 'nexus-dark',
  sidebarLayout: defaultLayout(),
  windowState: { width: 1280, height: 820 },
};

export class SettingsService implements Service {
  readonly name = 'settings';
  private logger!: Logger;
  private file = '';
  private _state: AppState = { ...DEFAULT_STATE };
  private writeQueue: Promise<void> = Promise.resolve();

  get state(): AppState {
    return this._state;
  }

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('settings');
    this.file = path.join(ctx.userData, 'nexus-state.json');
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await this.load();
  }

  async dispose(): Promise<void> {
    await this.writeQueue;
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = appStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this._state = { ...DEFAULT_STATE, ...parsed.data };
      } else {
        this.logger.warn('state validation failed, reverting to defaults', parsed.error.flatten());
        this._state = { ...DEFAULT_STATE };
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.warn('state load error', err);
      this._state = { ...DEFAULT_STATE };
    }
    this.reconcileLayout();
  }

  private reconcileLayout(): void {
    const layout = this._state.sidebarLayout ?? defaultLayout();
    const reconciled = reconcile(layout, this._state.enabledModuleIds);
    if (JSON.stringify(reconciled) !== JSON.stringify(layout)) {
      this._state = { ...this._state, sidebarLayout: reconciled };
    } else if (!this._state.sidebarLayout) {
      this._state = { ...this._state, sidebarLayout: reconciled };
    }
  }

  private queueWrite(): void {
    const snapshot = this._state;
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const tmp = `${this.file}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await fs.rename(tmp, this.file);
      } catch (err) {
        this.logger.error('state write failed', err);
      }
    });
  }

  update(patch: Partial<AppState>): void {
    this._state = { ...this._state, ...patch };
    this.queueWrite();
  }

  enableModule(id: string): void {
    if (!this._state.enabledModuleIds.includes(id)) {
      this._state = {
        ...this._state,
        enabledModuleIds: [...this._state.enabledModuleIds, id],
      };
      this.reconcileLayout();
      this.queueWrite();
    }
  }

  disableModule(id: string): void {
    this._state = {
      ...this._state,
      enabledModuleIds: this._state.enabledModuleIds.filter((m) => m !== id),
      activeModuleId: this._state.activeModuleId === id ? null : this._state.activeModuleId,
    };
    this.reconcileLayout();
    this.queueWrite();
  }

  setSidebarLayout(layout: SidebarLayout): void {
    // Reconcile against current enabled modules so the UI can't drop or duplicate ids.
    const reconciled = reconcile(layout, this._state.enabledModuleIds);
    this._state = { ...this._state, sidebarLayout: reconciled };
    this.queueWrite();
  }

  setActive(id: string | null): void {
    if (this._state.activeModuleId === id) return;
    this._state = { ...this._state, activeModuleId: id };
    this.queueWrite();
  }

  setTheme(id: string): void {
    if (this._state.themeId === id) return;
    this._state = { ...this._state, themeId: id };
    this.queueWrite();
  }

  setWindowState(ws: AppState['windowState']): void {
    this._state = { ...this._state, windowState: ws };
    this.queueWrite();
  }
}
