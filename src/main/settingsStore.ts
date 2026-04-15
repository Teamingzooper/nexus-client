import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { AppState } from '../shared/types';

const DEFAULT_STATE: AppState = {
  activeModuleId: null,
  enabledModuleIds: [],
  themeId: 'nexus-dark',
};

export class SettingsStore {
  state: AppState = { ...DEFAULT_STATE };

  private get file(): string {
    return path.join(app.getPath('userData'), 'nexus-state.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn('[nexus] settings load failed:', err);
      }
      this.state = { ...DEFAULT_STATE };
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.state, null, 2), 'utf8');
  }

  async update(patch: Partial<AppState>): Promise<void> {
    this.state = { ...this.state, ...patch };
    await this.save();
  }

  async enableModule(id: string): Promise<void> {
    if (!this.state.enabledModuleIds.includes(id)) {
      this.state.enabledModuleIds = [...this.state.enabledModuleIds, id];
      await this.save();
    }
  }

  async disableModule(id: string): Promise<void> {
    this.state.enabledModuleIds = this.state.enabledModuleIds.filter((m) => m !== id);
    if (this.state.activeModuleId === id) this.state.activeModuleId = null;
    await this.save();
  }
}
