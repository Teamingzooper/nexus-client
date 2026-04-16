import { z } from 'zod';

// Instance ids look like module ids but can include a numeric suffix (e.g. "whatsapp-2").
export const instanceIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, 'instance id must be lowercase alphanumeric with - or _');

export const moduleInstanceSchema = z.object({
  id: instanceIdSchema,
  moduleId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/),
  name: z.string().min(1).max(96),
  createdAt: z.number().int().nonnegative().optional(),
  /**
   * Explicit Chromium partition override. When set, ViewService uses this
   * verbatim instead of deriving it from the instance id. Required for
   * profile-scoped instances (e.g. "persist:work:whatsapp") so switching
   * profiles actually loads different cookies/storage.
   */
  partition: z
    .string()
    .regex(/^persist:[a-z0-9][a-z0-9-_:]*$/, 'partition must start with persist: and be lowercase alphanumeric')
    .optional(),
  /**
   * When true, this instance is muted: NotificationService skips its
   * native notifications entirely AND its unread count does not
   * contribute to the dock badge total. The sidebar still shows the
   * count badge so the user can see there's activity, just visually
   * marked as muted.
   */
  muted: z.boolean().optional(),
});

export type ModuleInstance = z.infer<typeof moduleInstanceSchema>;

/** Derive a unique instance id for a given module. First instance keeps the plain module id. */
export function nextInstanceId(moduleId: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(moduleId)) return moduleId;
  let n = 2;
  while (taken.has(`${moduleId}-${n}`)) n += 1;
  return `${moduleId}-${n}`;
}

/** Derive a default display name: "Name", "Name 2", ... */
export function nextInstanceName(moduleName: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(moduleName)) return moduleName;
  let n = 2;
  while (taken.has(`${moduleName} ${n}`)) n += 1;
  return `${moduleName} ${n}`;
}

/** Partition for a given instance. Used by ViewService to isolate session state. */
export function partitionForInstance(instanceId: string): string {
  return `persist:${instanceId}`;
}
