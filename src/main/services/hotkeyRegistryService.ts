import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';
import type { HotkeyAction } from '../../shared/types';

export interface HotkeyRegistration {
  id: string;
  label: string;
  description?: string;
  defaultBinding: string | null;
}

export type RebindResult =
  | { ok: true }
  | { ok: false; conflictingActionId: string };

interface PersistenceAdapter {
  load(): Record<string, string>;
  save(bindings: Record<string, string>): void;
}

/**
 * Generic rebindable hotkey registry. Not email-specific — any service can
 * register named actions with default bindings. The renderer surfaces all of
 * these in the Hotkeys settings tab.
 *
 * Chord syntax follows Electron's Accelerator format
 * (https://www.electronjs.org/docs/latest/api/accelerator), but resolution
 * is done here by string equality — the actual key-event → chord translation
 * happens in whoever invokes `resolveChord` (typically ViewService's
 * `before-input-event` handler).
 */
export class HotkeyRegistryService implements Service {
  readonly name = 'hotkeys';
  private logger: Logger | null = null;
  private registrations = new Map<string, HotkeyRegistration>();
  private overrides: Record<string, string> = {}; // action id → chord or "" for unbound
  private adapter: PersistenceAdapter | null = null;

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('hotkeys');
    if (!this.adapter) {
      // Default no-op adapter; SettingsService wires in a real one during index.ts setup.
      this.adapter = { load: () => ({}), save: () => {} };
    }
    this.overrides = this.adapter.load();
  }

  /**
   * Swap out the persistence adapter — used both by tests and by the app
   * bootstrap to wire SettingsService in after both services are constructed.
   */
  configure(adapter: PersistenceAdapter): void {
    this.adapter = adapter;
    this.overrides = adapter.load();
  }

  register(reg: HotkeyRegistration): void {
    if (this.registrations.has(reg.id)) {
      throw new Error(`hotkey action "${reg.id}" already registered`);
    }
    this.registrations.set(reg.id, reg);
  }

  list(): HotkeyAction[] {
    return Array.from(this.registrations.values()).map((reg) => ({
      id: reg.id,
      label: reg.label,
      description: reg.description,
      defaultBinding: reg.defaultBinding,
      currentBinding: this.current(reg.id),
    }));
  }

  /** Returns the action id bound to this chord, or null. */
  resolveChord(chord: string): string | null {
    for (const reg of this.registrations.values()) {
      if (this.current(reg.id) === chord) return reg.id;
    }
    return null;
  }

  rebind(actionId: string, binding: string | null): RebindResult {
    if (!this.registrations.has(actionId)) {
      throw new Error(`unknown hotkey action: ${actionId}`);
    }
    if (binding !== null) {
      for (const [otherId] of this.registrations) {
        if (otherId !== actionId && this.current(otherId) === binding) {
          return { ok: false, conflictingActionId: otherId };
        }
      }
    }
    // Store "" for explicit unbind (so we distinguish from "no override").
    this.overrides[actionId] = binding ?? '';
    this.persist();
    return { ok: true };
  }

  reset(actionId: string): void {
    if (!this.registrations.has(actionId)) {
      throw new Error(`unknown hotkey action: ${actionId}`);
    }
    delete this.overrides[actionId];
    this.persist();
  }

  private current(actionId: string): string | null {
    const override = this.overrides[actionId];
    if (override === undefined) {
      return this.registrations.get(actionId)!.defaultBinding;
    }
    return override === '' ? null : override;
  }

  private persist(): void {
    this.adapter?.save({ ...this.overrides });
  }
}
