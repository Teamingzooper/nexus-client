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
