import { z } from 'zod';
import { sidebarLayoutSchema } from './sidebarLayout';
import { moduleInstanceSchema } from './instance';

// Profile ids look like module ids — stable, URL-safe, no path separators.
export const profileIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, 'profile id must be lowercase alphanumeric with - or _');

/**
 * Profile metadata: stored plaintext in profiles.json. Never contains
 * anything sensitive on its own — just identity, auth material, and the
 * ciphertext of the per-profile state.
 *
 * When hasPassword === false, `state` is a plaintext JSON-encoded
 * ProfileState. When hasPassword === true, `state` is base64(iv | tag |
 * ciphertext) of the same ProfileState, encrypted with a scrypt-derived
 * key from the user's password + `authSalt`. `authVerifier` is a
 * scrypt(password, verifierSalt) output used to check the password
 * WITHOUT decrypting the state — it's constant-time compared during
 * unlock.
 */
export const profileMetaSchema = z.object({
  id: profileIdSchema,
  name: z.string().min(1).max(64),
  createdAt: z.number().int().nonnegative(),
  hasPassword: z.boolean(),
  // Only present when hasPassword === true.
  authSalt: z.string().optional(),
  verifierSalt: z.string().optional(),
  authVerifier: z.string().optional(),
  // Either plaintext JSON (no password) or base64 ciphertext (with password).
  state: z.string(),
});

export type ProfileMeta = z.infer<typeof profileMetaSchema>;

/**
 * Per-profile state — the stuff that differs between "Work" and "Personal":
 * which instances exist, how they're arranged in the sidebar, and which one
 * is currently active. Themes, window size, notification prefs are all
 * global, NOT per-profile.
 */
export const profileStateSchema = z.object({
  activeInstanceId: z.string().nullable(),
  instances: z.array(moduleInstanceSchema),
  sidebarLayout: sidebarLayoutSchema.optional(),
  /**
   * Per-profile theme override. When set, the active profile's themeId
   * wins over SettingsService.themeId (which becomes the locked-state
   * fallback). Lets a user have a dark "Work" profile and a midnight
   * "Personal" profile, etc.
   */
  themeId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/)
    .optional(),
});

export type ProfileState = z.infer<typeof profileStateSchema>;

/** Top-level file on disk: { profiles: ProfileMeta[] }. */
export const profilesFileSchema = z.object({
  version: z.literal(1),
  profiles: z.array(profileMetaSchema),
});

export type ProfilesFile = z.infer<typeof profilesFileSchema>;

export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PROFILE_NAME = 'Default';

export function emptyProfileState(): ProfileState {
  return {
    activeInstanceId: null,
    instances: [],
  };
}

/** Compute a unique profile id from a desired name, avoiding collisions. */
export function nextProfileId(desiredId: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(desiredId)) return desiredId;
  let n = 2;
  while (taken.has(`${desiredId}-${n}`)) n += 1;
  return `${desiredId}-${n}`;
}

/**
 * Partition string for an instance under a profile. Legacy instances (migrated
 * from the pre-profiles state) keep their old `persist:<instanceId>` partition
 * so users don't lose WhatsApp login state. Instances created AFTER a profile
 * exists are stored with an explicit partition on the instance itself so this
 * helper is only used for defaults at creation time.
 */
export function partitionForProfileInstance(profileId: string, instanceId: string): string {
  if (profileId === DEFAULT_PROFILE_ID) {
    // Default profile = backward-compat: unnamespaced partitions.
    return `persist:${instanceId}`;
  }
  return `persist:${profileId}:${instanceId}`;
}
