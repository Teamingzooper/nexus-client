import { z } from 'zod';

// Inlined to avoid a circular import with schemas.ts.
const moduleIdLike = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/);

export const sidebarGroupSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, 'group id must be lowercase alphanumeric with - or _'),
  name: z.string().min(1).max(64),
  collapsed: z.boolean().optional(),
  moduleIds: z.array(moduleIdLike),
});

export const sidebarLayoutSchema = z.object({
  groups: z.array(sidebarGroupSchema).min(1),
});

export type SidebarGroup = z.infer<typeof sidebarGroupSchema>;
export type SidebarLayout = z.infer<typeof sidebarLayoutSchema>;

export const DEFAULT_GROUP_ID = 'main';

export function defaultLayout(): SidebarLayout {
  return {
    groups: [{ id: DEFAULT_GROUP_ID, name: 'Modules', moduleIds: [] }],
  };
}

/** Find which group contains a module. Returns null if not present. */
export function findGroup(layout: SidebarLayout, moduleId: string): SidebarGroup | null {
  return layout.groups.find((g) => g.moduleIds.includes(moduleId)) ?? null;
}

/** Remove a module from wherever it currently lives. Returns a new layout. */
export function removeModule(layout: SidebarLayout, moduleId: string): SidebarLayout {
  return {
    groups: layout.groups.map((g) => ({
      ...g,
      moduleIds: g.moduleIds.filter((id) => id !== moduleId),
    })),
  };
}

/**
 * Guarantee that every id in `enabledIds` appears in exactly one group, appending
 * any missing ones to the first group. Also prunes ids no longer enabled. Pure.
 */
export function reconcile(layout: SidebarLayout, enabledIds: readonly string[]): SidebarLayout {
  const enabledSet = new Set(enabledIds);

  // 1. Prune disabled/unknown.
  let groups = layout.groups.map((g) => ({
    ...g,
    moduleIds: g.moduleIds.filter((id) => enabledSet.has(id)),
  }));

  // 2. Deduplicate (same id in two groups — keep first).
  const seen = new Set<string>();
  groups = groups.map((g) => ({
    ...g,
    moduleIds: g.moduleIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));

  // 3. Ensure at least one group exists.
  if (groups.length === 0) {
    groups = [{ id: DEFAULT_GROUP_ID, name: 'Modules', moduleIds: [] }];
  }

  // 4. Append missing enabled modules to the first group.
  const placed = new Set(groups.flatMap((g) => g.moduleIds));
  const missing = enabledIds.filter((id) => !placed.has(id));
  if (missing.length > 0) {
    groups = groups.map((g, i) =>
      i === 0 ? { ...g, moduleIds: [...g.moduleIds, ...missing] } : g,
    );
  }

  return { groups };
}

export type DropTarget =
  | { kind: 'before' | 'after'; groupId: string; moduleId: string }
  | { kind: 'group-append'; groupId: string };

/** Move a module to a new position. Pure. */
export function moveModule(
  layout: SidebarLayout,
  moduleId: string,
  target: DropTarget,
): SidebarLayout {
  // Remove the module from wherever it is now.
  const stripped = removeModule(layout, moduleId);

  const groups = stripped.groups.map((g) => {
    if (target.kind === 'group-append' && g.id === target.groupId) {
      return { ...g, moduleIds: [...g.moduleIds, moduleId] };
    }
    if ((target.kind === 'before' || target.kind === 'after') && g.id === target.groupId) {
      const idx = g.moduleIds.indexOf(target.moduleId);
      if (idx < 0) {
        return { ...g, moduleIds: [...g.moduleIds, moduleId] };
      }
      const insertAt = target.kind === 'before' ? idx : idx + 1;
      const next = [...g.moduleIds];
      next.splice(insertAt, 0, moduleId);
      return { ...g, moduleIds: next };
    }
    return g;
  });

  return { groups };
}

/** Add a new group at the end. Pure. */
export function addGroup(layout: SidebarLayout, group: SidebarGroup): SidebarLayout {
  if (layout.groups.some((g) => g.id === group.id)) return layout;
  return { groups: [...layout.groups, { ...group, moduleIds: group.moduleIds ?? [] }] };
}

/** Rename a group. Pure. */
export function renameGroup(
  layout: SidebarLayout,
  groupId: string,
  name: string,
): SidebarLayout {
  return {
    groups: layout.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
  };
}

/** Toggle a group's collapsed state. Pure. */
export function toggleCollapsed(layout: SidebarLayout, groupId: string): SidebarLayout {
  return {
    groups: layout.groups.map((g) =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
    ),
  };
}

/**
 * Delete a group and relocate its modules into the first remaining group.
 * Refuses to delete the only remaining group.
 */
export function deleteGroup(layout: SidebarLayout, groupId: string): SidebarLayout {
  if (layout.groups.length <= 1) return layout;
  const victim = layout.groups.find((g) => g.id === groupId);
  if (!victim) return layout;
  const remaining = layout.groups.filter((g) => g.id !== groupId);
  return {
    groups: remaining.map((g, i) =>
      i === 0 ? { ...g, moduleIds: [...g.moduleIds, ...victim.moduleIds] } : g,
    ),
  };
}

/** Reorder groups by providing a new order of group ids. Unknown ids dropped, missing appended. */
export function reorderGroups(layout: SidebarLayout, orderedIds: string[]): SidebarLayout {
  const byId = new Map(layout.groups.map((g) => [g.id, g]));
  const result: SidebarGroup[] = [];
  for (const id of orderedIds) {
    const g = byId.get(id);
    if (g) {
      result.push(g);
      byId.delete(id);
    }
  }
  for (const g of byId.values()) result.push(g);
  return { groups: result };
}
