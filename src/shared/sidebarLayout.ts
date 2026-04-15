import { z } from 'zod';

// Inlined to avoid a circular import with schemas.ts.
// Entry ids are either module ids or instance ids; both share the same format.
const entryIdLike = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9][a-z0-9-_]*$/);

export const sidebarGroupSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, 'group id must be lowercase alphanumeric with - or _'),
  name: z.string().min(1).max(64),
  collapsed: z.boolean().optional(),
  entryIds: z.array(entryIdLike),
});

export const sidebarLayoutSchema = z.object({
  groups: z.array(sidebarGroupSchema).min(1),
});

export type SidebarGroup = z.infer<typeof sidebarGroupSchema>;
export type SidebarLayout = z.infer<typeof sidebarLayoutSchema>;

export const DEFAULT_GROUP_ID = 'main';

export function defaultLayout(): SidebarLayout {
  return {
    groups: [{ id: DEFAULT_GROUP_ID, name: 'Modules', entryIds: [] }],
  };
}

/** Find which group contains an entry. Returns null if not present. */
export function findGroup(layout: SidebarLayout, entryId: string): SidebarGroup | null {
  return layout.groups.find((g) => g.entryIds.includes(entryId)) ?? null;
}

/** Remove an entry from wherever it currently lives. Returns a new layout. */
export function removeEntry(layout: SidebarLayout, entryId: string): SidebarLayout {
  return {
    groups: layout.groups.map((g) => ({
      ...g,
      entryIds: g.entryIds.filter((id) => id !== entryId),
    })),
  };
}

/**
 * Guarantee that every id in `validIds` appears in exactly one group, appending
 * any missing ones to the first group. Also prunes ids no longer valid. Pure.
 */
export function reconcile(layout: SidebarLayout, validIds: readonly string[]): SidebarLayout {
  const validSet = new Set(validIds);

  // 1. Prune ids that are no longer valid.
  let groups = layout.groups.map((g) => ({
    ...g,
    entryIds: g.entryIds.filter((id) => validSet.has(id)),
  }));

  // 2. Deduplicate (same id in two groups — keep the first occurrence).
  const seen = new Set<string>();
  groups = groups.map((g) => ({
    ...g,
    entryIds: g.entryIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));

  // 3. Ensure at least one group exists.
  if (groups.length === 0) {
    groups = [{ id: DEFAULT_GROUP_ID, name: 'Modules', entryIds: [] }];
  }

  // 4. Append missing valid ids to the first group.
  const placed = new Set(groups.flatMap((g) => g.entryIds));
  const missing = validIds.filter((id) => !placed.has(id));
  if (missing.length > 0) {
    groups = groups.map((g, i) =>
      i === 0 ? { ...g, entryIds: [...g.entryIds, ...missing] } : g,
    );
  }

  return { groups };
}

export type DropTarget =
  | { kind: 'before' | 'after'; groupId: string; entryId: string }
  | { kind: 'group-append'; groupId: string };

/** Move an entry to a new position. Pure. */
export function moveEntry(
  layout: SidebarLayout,
  entryId: string,
  target: DropTarget,
): SidebarLayout {
  // Remove the entry from wherever it is now.
  const stripped = removeEntry(layout, entryId);

  const groups = stripped.groups.map((g) => {
    if (target.kind === 'group-append' && g.id === target.groupId) {
      return { ...g, entryIds: [...g.entryIds, entryId] };
    }
    if ((target.kind === 'before' || target.kind === 'after') && g.id === target.groupId) {
      const idx = g.entryIds.indexOf(target.entryId);
      if (idx < 0) {
        return { ...g, entryIds: [...g.entryIds, entryId] };
      }
      const insertAt = target.kind === 'before' ? idx : idx + 1;
      const next = [...g.entryIds];
      next.splice(insertAt, 0, entryId);
      return { ...g, entryIds: next };
    }
    return g;
  });

  return { groups };
}

/** Add a new group at the end. Pure. */
export function addGroup(layout: SidebarLayout, group: SidebarGroup): SidebarLayout {
  if (layout.groups.some((g) => g.id === group.id)) return layout;
  return { groups: [...layout.groups, { ...group, entryIds: group.entryIds ?? [] }] };
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
 * Delete a group and relocate its entries into the first remaining group.
 * Refuses to delete the only remaining group.
 */
export function deleteGroup(layout: SidebarLayout, groupId: string): SidebarLayout {
  if (layout.groups.length <= 1) return layout;
  const victim = layout.groups.find((g) => g.id === groupId);
  if (!victim) return layout;
  const remaining = layout.groups.filter((g) => g.id !== groupId);
  return {
    groups: remaining.map((g, i) =>
      i === 0 ? { ...g, entryIds: [...g.entryIds, ...victim.entryIds] } : g,
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
