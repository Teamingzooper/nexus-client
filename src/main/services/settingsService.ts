import * as fs from 'fs/promises';
import * as path from 'path';
import { appStateSchema } from '../../shared/schemas';
import type { AppState, ModuleInstance, SidebarLayout } from '../../shared/types';
import { defaultLayout, reconcile } from '../../shared/sidebarLayout';
import { nextInstanceId, nextInstanceName } from '../../shared/instance';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';

const DEFAULT_STATE: AppState = {
  activeInstanceId: null,
  instances: [],
  themeId: 'nexus-dark',
  notificationsEnabled: true,
  sidebarLayout: defaultLayout(),
  windowState: { width: 1280, height: 820 },
};

/**
 * Migrate legacy state shapes into the current one.
 * - enabledModuleIds → instances (one instance per id, using id as instance id)
 * - sidebarLayout.groups[].moduleIds → entryIds
 * Safe to run on already-migrated data.
 */
function migrate(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const out = { ...raw };

  if (Array.isArray(raw.enabledModuleIds) && !Array.isArray(raw.instances)) {
    out.instances = raw.enabledModuleIds.map((id: string) => ({
      id,
      moduleId: id,
      name: id,
    }));
    delete out.enabledModuleIds;
  }

  // Rename activeModuleId → activeInstanceId if needed.
  if ('activeModuleId' in raw && !('activeInstanceId' in raw)) {
    out.activeInstanceId = raw.activeModuleId ?? null;
    delete out.activeModuleId;
  }

  if (raw.sidebarLayout?.groups) {
    out.sidebarLayout = {
      ...raw.sidebarLayout,
      groups: raw.sidebarLayout.groups.map((g: any) => {
        if ('moduleIds' in g && !('entryIds' in g)) {
          const { moduleIds, ...rest } = g;
          return { ...rest, entryIds: moduleIds };
        }
        return g;
      }),
    };
  }

  return out;
}

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
      const migrated = migrate(JSON.parse(raw));
      const parsed = appStateSchema.safeParse(migrated);
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
    const validIds = this._state.instances.map((i) => i.id);
    const reconciled = reconcile(layout, validIds);
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

  /** Create a new instance of the given module. Returns the new instance. */
  addInstance(moduleId: string, moduleName: string): ModuleInstance {
    const existingIds = this._state.instances.map((i) => i.id);
    const existingNames = this._state.instances
      .filter((i) => i.moduleId === moduleId)
      .map((i) => i.name);
    const id = nextInstanceId(moduleId, existingIds);
    const name = nextInstanceName(moduleName, existingNames);
    const instance: ModuleInstance = { id, moduleId, name, createdAt: Date.now() };
    this._state = {
      ...this._state,
      instances: [...this._state.instances, instance],
    };
    this.reconcileLayout();
    this.queueWrite();
    return instance;
  }

  removeInstance(instanceId: string): void {
    this._state = {
      ...this._state,
      instances: this._state.instances.filter((i) => i.id !== instanceId),
      activeInstanceId:
        this._state.activeInstanceId === instanceId ? null : this._state.activeInstanceId,
    };
    this.reconcileLayout();
    this.queueWrite();
  }

  renameInstance(instanceId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this._state = {
      ...this._state,
      instances: this._state.instances.map((i) =>
        i.id === instanceId ? { ...i, name: trimmed.slice(0, 96) } : i,
      ),
    };
    this.queueWrite();
  }

  getInstance(instanceId: string): ModuleInstance | undefined {
    return this._state.instances.find((i) => i.id === instanceId);
  }

  setActive(instanceId: string | null): void {
    if (this._state.activeInstanceId === instanceId) return;
    this._state = { ...this._state, activeInstanceId: instanceId };
    this.queueWrite();
  }

  setTheme(id: string): void {
    if (this._state.themeId === id) return;
    this._state = { ...this._state, themeId: id };
    this.queueWrite();
  }

  setNotificationsEnabled(enabled: boolean): void {
    if (this._state.notificationsEnabled === enabled) return;
    this._state = { ...this._state, notificationsEnabled: enabled };
    this.queueWrite();
  }

  setWindowState(ws: AppState['windowState']): void {
    this._state = { ...this._state, windowState: ws };
    this.queueWrite();
  }

  setSidebarLayout(layout: SidebarLayout): void {
    const validIds = this._state.instances.map((i) => i.id);
    const reconciled = reconcile(layout, validIds);
    this._state = { ...this._state, sidebarLayout: reconciled };
    this.queueWrite();
  }

  /** Reset settings to defaults and delete the persisted state file. */
  async clearAll(): Promise<void> {
    this._state = { ...DEFAULT_STATE };
    try {
      await fs.rm(this.file, { force: true });
    } catch (err) {
      this.logger.warn('could not remove state file', err);
    }
  }
}
