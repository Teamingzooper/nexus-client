import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ModuleInstance,
  ProfileMeta,
  ProfileState,
  ProfileSummary,
  SidebarLayout,
} from '../../shared/types';
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  emptyProfileState,
  partitionForProfileInstance,
  profilesFileSchema,
  profileStateSchema,
  nextProfileId,
  profileIdSchema,
} from '../../shared/profile';
import { defaultLayout, reconcile } from '../../shared/sidebarLayout';
import { nextInstanceId, nextInstanceName } from '../../shared/instance';
import {
  computeVerifier,
  deriveKey,
  decryptJson,
  encryptJson,
  newSalt,
  verifyPassword,
} from '../core/crypto';
import type { Service, ServiceContext } from '../core/service';
import type { Logger } from '../core/logger';

/**
 * ProfileService owns:
 *   1. profiles.json: the list of profile metadata (names, auth material,
 *      encrypted state blobs).
 *   2. The currently-unlocked profile's in-memory state (instances, layout,
 *      active instance).
 *
 * It does NOT own global prefs (themes, window state, notification flags) —
 * those stay in SettingsService.
 *
 * Lock semantics: "locked" = no profile is currently unlocked; instance
 * state is empty and getInstance/list return nothing. "Unlocked" = a
 * profile is active, its ProfileState is loaded into memory, and all
 * instance-level operations go through it.
 */
export class ProfileService implements Service {
  readonly name = 'profiles';
  private logger!: Logger;
  private profilesFile = '';
  private metas: ProfileMeta[] = [];

  private activeId: string | null = null;
  private activeState: ProfileState = emptyProfileState();
  // Key kept in memory while a password-protected profile is unlocked.
  // Cleared on lock. Never persisted.
  private activeKey: Buffer | null = null;

  private writeQueue: Promise<void> = Promise.resolve();

  async init(ctx: ServiceContext): Promise<void> {
    this.logger = ctx.logger.child('profiles');
    this.profilesFile = path.join(ctx.userData, 'profiles.json');
    await this.load();
    await this.migrateLegacyIfNeeded(ctx.userData);
  }

  async dispose(): Promise<void> {
    await this.writeQueue;
    this.activeKey = null;
  }

  // ───────────────────────────────────────────────────────── load / persist ──

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.profilesFile, 'utf8');
      const parsed = profilesFileSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this.metas = parsed.data.profiles;
      } else {
        this.logger.warn('profiles.json invalid, starting empty', parsed.error.flatten());
        this.metas = [];
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.warn('profiles load error', err);
      this.metas = [];
    }
  }

  private queueWrite(): void {
    const snapshot = { version: 1 as const, profiles: [...this.metas] };
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.profilesFile), { recursive: true });
        const tmp = `${this.profilesFile}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await fs.rename(tmp, this.profilesFile);
      } catch (err) {
        this.logger.error('profiles write failed', err);
      }
    });
  }

  // ──────────────────────────────────────────────────── legacy migration ──

  /**
   * If the old pre-profiles nexus-state.json exists AND there are no
   * profiles yet, migrate its instances + sidebar layout into a new
   * Default profile. The existing session partitions (persist:<instanceId>)
   * are preserved — we set each instance's partition explicitly so users
   * don't lose their WhatsApp login. The old state file is renamed (not
   * deleted) so users can recover if migration misbehaves.
   */
  private async migrateLegacyIfNeeded(userData: string): Promise<void> {
    if (this.metas.length > 0) return;
    const legacyFile = path.join(userData, 'nexus-state.json');
    let legacy: any;
    try {
      const raw = await fs.readFile(legacyFile, 'utf8');
      legacy = JSON.parse(raw);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        // Fresh install — create an empty Default profile and we're done.
        this.createDefaultProfile();
        return;
      }
      this.logger.warn('legacy state read failed', err);
      this.createDefaultProfile();
      return;
    }

    const instancesRaw = Array.isArray(legacy?.instances) ? legacy.instances : [];
    const instances: ModuleInstance[] = instancesRaw
      .filter((i: any) => i && typeof i.id === 'string' && typeof i.moduleId === 'string')
      .map((i: any) => ({
        id: String(i.id),
        moduleId: String(i.moduleId),
        name: typeof i.name === 'string' ? i.name : i.id,
        createdAt: typeof i.createdAt === 'number' ? i.createdAt : Date.now(),
        // Preserve the legacy partition name so the migration doesn't
        // invalidate logged-in sessions.
        partition: `persist:${i.id}`,
      }));

    const sidebarLayout =
      legacy?.sidebarLayout && Array.isArray(legacy.sidebarLayout.groups)
        ? legacy.sidebarLayout
        : undefined;
    const activeInstanceId =
      typeof legacy?.activeInstanceId === 'string' ? legacy.activeInstanceId : null;

    const state: ProfileState = {
      activeInstanceId,
      instances,
      sidebarLayout,
    };

    const meta: ProfileMeta = {
      id: DEFAULT_PROFILE_ID,
      name: DEFAULT_PROFILE_NAME,
      createdAt: Date.now(),
      hasPassword: false,
      state: JSON.stringify(state),
    };
    this.metas = [meta];
    this.queueWrite();
    this.logger.info(
      `migrated legacy state into Default profile (${instances.length} instance(s))`,
    );

    // Rename the old file so there's a recovery breadcrumb, not a delete.
    try {
      await fs.rename(legacyFile, `${legacyFile}.pre-profiles.bak`);
    } catch (err) {
      this.logger.warn('legacy state backup rename failed', err);
    }
  }

  private createDefaultProfile(): void {
    const meta: ProfileMeta = {
      id: DEFAULT_PROFILE_ID,
      name: DEFAULT_PROFILE_NAME,
      createdAt: Date.now(),
      hasPassword: false,
      state: JSON.stringify(emptyProfileState()),
    };
    this.metas = [meta];
    this.queueWrite();
  }

  // ──────────────────────────────────────────────────────────── queries ──

  /** Summaries of all profiles — safe to send to the renderer. */
  list(): ProfileSummary[] {
    return this.metas.map((m) => ({
      id: m.id,
      name: m.name,
      createdAt: m.createdAt,
      hasPassword: m.hasPassword,
    }));
  }

  /** Current unlocked profile summary, or null if locked/no-profile. */
  current(): ProfileSummary | null {
    if (!this.activeId) return null;
    const m = this.metas.find((p) => p.id === this.activeId);
    if (!m) return null;
    return {
      id: m.id,
      name: m.name,
      createdAt: m.createdAt,
      hasPassword: m.hasPassword,
    };
  }

  isLocked(): boolean {
    return this.activeId === null;
  }

  activeProfileId(): string | null {
    return this.activeId;
  }

  /** Current unlocked profile's state, or an empty state if locked. */
  get state(): ProfileState {
    return this.activeState;
  }

  // ────────────────────────────────────────────────────── profile CRUD ──

  async createProfile(input: { name: string; password?: string }): Promise<ProfileSummary> {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('profile name is required');
    if (trimmed.length > 64) throw new Error('profile name too long');

    const base = slugify(trimmed) || `profile-${Date.now()}`;
    const id = nextProfileId(
      profileIdSchema.safeParse(base).success ? base : `profile-${Date.now()}`,
      this.metas.map((m) => m.id),
    );

    const password = input.password?.trim() || '';
    let meta: ProfileMeta;

    if (password) {
      const authSalt = newSalt();
      const verifierSalt = newSalt();
      const authVerifier = computeVerifier(password, verifierSalt);
      const key = deriveKey(password, authSalt);
      const state = emptyProfileState();
      meta = {
        id,
        name: trimmed,
        createdAt: Date.now(),
        hasPassword: true,
        authSalt,
        verifierSalt,
        authVerifier,
        state: encryptJson(state, key),
      };
    } else {
      meta = {
        id,
        name: trimmed,
        createdAt: Date.now(),
        hasPassword: false,
        state: JSON.stringify(emptyProfileState()),
      };
    }

    this.metas = [...this.metas, meta];
    this.queueWrite();
    this.logger.info(`created profile ${id} (${trimmed}), password=${!!password}`);
    return {
      id: meta.id,
      name: meta.name,
      createdAt: meta.createdAt,
      hasPassword: meta.hasPassword,
    };
  }

  async deleteProfile(id: string): Promise<void> {
    if (id === DEFAULT_PROFILE_ID && this.metas.length === 1) {
      throw new Error('cannot delete the only profile');
    }
    const meta = this.metas.find((m) => m.id === id);
    if (!meta) throw new Error(`unknown profile: ${id}`);
    this.metas = this.metas.filter((m) => m.id !== id);
    if (this.activeId === id) {
      this.lock();
    }
    this.queueWrite();
  }

  renameProfile(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.metas = this.metas.map((m) =>
      m.id === id ? { ...m, name: trimmed.slice(0, 64) } : m,
    );
    this.queueWrite();
  }

  // ──────────────────────────────────────────────────── unlock / lock ──

  /**
   * Unlock a profile and make it the active one. For password-less
   * profiles, pass `undefined` as the password. For password-protected
   * profiles, a correct password is required — throws 'wrong password'
   * otherwise. Automatically locks any previously-active profile first.
   */
  async unlock(id: string, password?: string): Promise<void> {
    const meta = this.metas.find((m) => m.id === id);
    if (!meta) throw new Error(`unknown profile: ${id}`);

    let state: ProfileState;
    if (meta.hasPassword) {
      if (!password) throw new Error('password required');
      if (!meta.verifierSalt || !meta.authVerifier || !meta.authSalt) {
        throw new Error('profile is marked password-protected but missing auth material');
      }
      if (!verifyPassword(password, meta.verifierSalt, meta.authVerifier)) {
        throw new Error('wrong password');
      }
      const key = deriveKey(password, meta.authSalt);
      try {
        const decrypted = decryptJson<unknown>(meta.state, key);
        const parsed = profileStateSchema.safeParse(decrypted);
        if (!parsed.success) throw new Error('decrypted state failed validation');
        state = parsed.data;
      } catch (err) {
        throw new Error('failed to decrypt profile state');
      }
      this.activeKey = key;
    } else {
      try {
        const parsed = profileStateSchema.safeParse(JSON.parse(meta.state));
        if (!parsed.success) throw new Error('state failed validation');
        state = parsed.data;
      } catch (err) {
        this.logger.warn(`profile ${id} state invalid, resetting`, err);
        state = emptyProfileState();
      }
      this.activeKey = null;
    }

    // If another profile was active, discard its in-memory state (no need
    // to persist — we save on every write, not on switch).
    this.activeId = id;
    this.activeState = reconcileProfileState(state);
    this.logger.info(`unlocked profile ${id}`);
  }

  /** Clear the active profile. No disk writes. */
  lock(): void {
    if (this.activeId) this.logger.info(`locked profile ${this.activeId}`);
    this.activeId = null;
    this.activeState = emptyProfileState();
    this.activeKey = null;
  }

  /**
   * Change (or set/unset) the password for a profile. Must be called with
   * the CURRENT password for password-protected profiles; null/undefined
   * for password-less profiles. Decrypts state with the old key,
   * re-encrypts with the new key, rewrites the meta entry.
   */
  async changePassword(
    id: string,
    oldPassword: string | null,
    newPassword: string | null,
  ): Promise<void> {
    const meta = this.metas.find((m) => m.id === id);
    if (!meta) throw new Error(`unknown profile: ${id}`);

    // 1. Decrypt/load current state.
    let state: ProfileState;
    if (meta.hasPassword) {
      if (!oldPassword) throw new Error('current password required');
      if (
        !meta.verifierSalt ||
        !meta.authVerifier ||
        !verifyPassword(oldPassword, meta.verifierSalt, meta.authVerifier)
      ) {
        throw new Error('wrong password');
      }
      const oldKey = deriveKey(oldPassword, meta.authSalt!);
      state = decryptJson<ProfileState>(meta.state, oldKey);
    } else {
      state = JSON.parse(meta.state) as ProfileState;
    }

    // 2. Encode with new password (or plaintext if clearing).
    let next: ProfileMeta;
    if (newPassword && newPassword.trim()) {
      const authSalt = newSalt();
      const verifierSalt = newSalt();
      const authVerifier = computeVerifier(newPassword, verifierSalt);
      const key = deriveKey(newPassword, authSalt);
      next = {
        ...meta,
        hasPassword: true,
        authSalt,
        verifierSalt,
        authVerifier,
        state: encryptJson(state, key),
      };
      if (this.activeId === id) this.activeKey = key;
    } else {
      next = {
        id: meta.id,
        name: meta.name,
        createdAt: meta.createdAt,
        hasPassword: false,
        state: JSON.stringify(state),
      };
      if (this.activeId === id) this.activeKey = null;
    }

    this.metas = this.metas.map((m) => (m.id === id ? next : m));
    this.queueWrite();
  }

  // ────────────────────────────────────────────── in-profile operations ──
  // Everything below operates on the CURRENT unlocked profile's state.
  // They throw if no profile is unlocked so callers handle that case.

  private requireUnlocked(): void {
    if (!this.activeId) throw new Error('no profile unlocked');
  }

  addInstance(moduleId: string, moduleName: string): ModuleInstance {
    this.requireUnlocked();
    const existingIds = this.activeState.instances.map((i) => i.id);
    const existingNames = this.activeState.instances
      .filter((i) => i.moduleId === moduleId)
      .map((i) => i.name);
    const id = nextInstanceId(moduleId, existingIds);
    const name = nextInstanceName(moduleName, existingNames);
    const instance: ModuleInstance = {
      id,
      moduleId,
      name,
      createdAt: Date.now(),
      partition: partitionForProfileInstance(this.activeId!, id),
    };
    this.activeState = {
      ...this.activeState,
      instances: [...this.activeState.instances, instance],
    };
    this.reconcileLayout();
    this.persistActive();
    return instance;
  }

  removeInstance(instanceId: string): void {
    this.requireUnlocked();
    this.activeState = {
      ...this.activeState,
      instances: this.activeState.instances.filter((i) => i.id !== instanceId),
      activeInstanceId:
        this.activeState.activeInstanceId === instanceId
          ? null
          : this.activeState.activeInstanceId,
    };
    this.reconcileLayout();
    this.persistActive();
  }

  renameInstance(instanceId: string, name: string): void {
    this.requireUnlocked();
    const trimmed = name.trim();
    if (!trimmed) return;
    this.activeState = {
      ...this.activeState,
      instances: this.activeState.instances.map((i) =>
        i.id === instanceId ? { ...i, name: trimmed.slice(0, 96) } : i,
      ),
    };
    this.persistActive();
  }

  setInstanceMuted(instanceId: string, muted: boolean): void {
    this.requireUnlocked();
    this.activeState = {
      ...this.activeState,
      instances: this.activeState.instances.map((i) =>
        i.id === instanceId ? { ...i, muted } : i,
      ),
    };
    this.persistActive();
  }

  /** Set the per-profile theme override. Pass null/undefined to clear. */
  setProfileTheme(themeId: string | null): void {
    this.requireUnlocked();
    if (themeId === null || themeId === undefined) {
      const { themeId: _drop, ...rest } = this.activeState;
      this.activeState = rest;
    } else {
      this.activeState = { ...this.activeState, themeId };
    }
    this.persistActive();
  }

  getInstance(instanceId: string): ModuleInstance | undefined {
    return this.activeState.instances.find((i) => i.id === instanceId);
  }

  setActive(instanceId: string | null): void {
    this.requireUnlocked();
    if (this.activeState.activeInstanceId === instanceId) return;
    this.activeState = { ...this.activeState, activeInstanceId: instanceId };
    this.persistActive();
  }

  setSidebarLayout(layout: SidebarLayout): void {
    this.requireUnlocked();
    const validIds = this.activeState.instances.map((i) => i.id);
    const reconciled = reconcile(layout, validIds);
    this.activeState = { ...this.activeState, sidebarLayout: reconciled };
    this.persistActive();
  }

  private reconcileLayout(): void {
    const layout = this.activeState.sidebarLayout ?? defaultLayout();
    const validIds = this.activeState.instances.map((i) => i.id);
    const reconciled = reconcile(layout, validIds);
    if (JSON.stringify(reconciled) !== JSON.stringify(layout)) {
      this.activeState = { ...this.activeState, sidebarLayout: reconciled };
    } else if (!this.activeState.sidebarLayout) {
      this.activeState = { ...this.activeState, sidebarLayout: reconciled };
    }
  }

  private persistActive(): void {
    if (!this.activeId) return;
    const id = this.activeId;
    const state = this.activeState;
    const meta = this.metas.find((m) => m.id === id);
    if (!meta) return;

    let encoded: string;
    if (meta.hasPassword) {
      if (!this.activeKey) {
        this.logger.warn(
          `persistActive: no key in memory for password-protected profile ${id}; skipping write`,
        );
        return;
      }
      encoded = encryptJson(state, this.activeKey);
    } else {
      encoded = JSON.stringify(state);
    }
    this.metas = this.metas.map((m) => (m.id === id ? { ...m, state: encoded } : m));
    this.queueWrite();
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

/**
 * On unlock, rebuild the sidebar layout so it matches the instance set in
 * case the last save was interrupted (e.g. after a crash mid-write).
 */
function reconcileProfileState(state: ProfileState): ProfileState {
  const layout = state.sidebarLayout ?? defaultLayout();
  const validIds = state.instances.map((i) => i.id);
  return {
    ...state,
    sidebarLayout: reconcile(layout, validIds),
  };
}
