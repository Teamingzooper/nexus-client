import { describe, it, expect } from 'vitest';
import {
  addGroup,
  defaultLayout,
  deleteGroup,
  findGroup,
  moveEntry,
  reconcile,
  removeEntry,
  renameGroup,
  reorderGroups,
  toggleCollapsed,
} from '../../src/shared/sidebarLayout';

describe('defaultLayout', () => {
  it('has one empty group', () => {
    const l = defaultLayout();
    expect(l.groups).toHaveLength(1);
    expect(l.groups[0].entryIds).toEqual([]);
  });
});

describe('reconcile', () => {
  it('appends new valid entries to the first group', () => {
    const l = defaultLayout();
    const out = reconcile(l, ['whatsapp', 'telegram']);
    expect(out.groups[0].entryIds).toEqual(['whatsapp', 'telegram']);
  });

  it('prunes invalid ids from all groups', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: ['whatsapp', 'telegram'] },
        { id: 'b', name: 'B', entryIds: ['messenger'] },
      ],
    };
    const out = reconcile(l, ['whatsapp']);
    expect(out.groups[0].entryIds).toEqual(['whatsapp']);
    expect(out.groups[1].entryIds).toEqual([]);
  });

  it('deduplicates if the same id appears in two groups', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: ['whatsapp'] },
        { id: 'b', name: 'B', entryIds: ['whatsapp'] },
      ],
    };
    const out = reconcile(l, ['whatsapp']);
    expect(out.groups[0].entryIds).toEqual(['whatsapp']);
    expect(out.groups[1].entryIds).toEqual([]);
  });

  it('creates a default group when layout has none', () => {
    const out = reconcile({ groups: [] as any }, ['whatsapp']);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].entryIds).toEqual(['whatsapp']);
  });
});

describe('moveEntry', () => {
  const base = {
    groups: [
      { id: 'a', name: 'A', entryIds: ['whatsapp', 'telegram', 'signal'] },
      { id: 'b', name: 'B', entryIds: ['messenger'] },
    ],
  };

  it('moves within a group (before)', () => {
    const out = moveEntry(base, 'signal', {
      kind: 'before',
      groupId: 'a',
      entryId: 'whatsapp',
    });
    expect(out.groups[0].entryIds).toEqual(['signal', 'whatsapp', 'telegram']);
  });

  it('moves within a group (after)', () => {
    const out = moveEntry(base, 'whatsapp', {
      kind: 'after',
      groupId: 'a',
      entryId: 'signal',
    });
    expect(out.groups[0].entryIds).toEqual(['telegram', 'signal', 'whatsapp']);
  });

  it('moves across groups', () => {
    const out = moveEntry(base, 'signal', { kind: 'group-append', groupId: 'b' });
    expect(out.groups[0].entryIds).toEqual(['whatsapp', 'telegram']);
    expect(out.groups[1].entryIds).toEqual(['messenger', 'signal']);
  });

  it('moves before a specific item in another group', () => {
    const out = moveEntry(base, 'telegram', {
      kind: 'before',
      groupId: 'b',
      entryId: 'messenger',
    });
    expect(out.groups[0].entryIds).toEqual(['whatsapp', 'signal']);
    expect(out.groups[1].entryIds).toEqual(['telegram', 'messenger']);
  });

  it('is a no-op when dropping on itself', () => {
    const out = moveEntry(base, 'whatsapp', {
      kind: 'before',
      groupId: 'a',
      entryId: 'telegram',
    });
    expect(out.groups[0].entryIds).toEqual(['whatsapp', 'telegram', 'signal']);
  });
});

describe('removeEntry', () => {
  it('removes from wherever the entry lives', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: ['whatsapp'] },
        { id: 'b', name: 'B', entryIds: ['telegram'] },
      ],
    };
    expect(removeEntry(l, 'telegram').groups[1].entryIds).toEqual([]);
    expect(removeEntry(l, 'whatsapp').groups[0].entryIds).toEqual([]);
  });
});

describe('addGroup', () => {
  it('appends a new group', () => {
    const l = defaultLayout();
    const out = addGroup(l, { id: 'work', name: 'Work', entryIds: [] });
    expect(out.groups).toHaveLength(2);
    expect(out.groups[1].id).toBe('work');
  });

  it('is a no-op when id already exists', () => {
    const l = defaultLayout();
    const once = addGroup(l, { id: 'work', name: 'Work', entryIds: [] });
    const twice = addGroup(once, { id: 'work', name: 'Other', entryIds: [] });
    expect(twice.groups).toHaveLength(2);
    expect(twice.groups[1].name).toBe('Work');
  });
});

describe('renameGroup', () => {
  it('updates only the target group', () => {
    const l = addGroup(defaultLayout(), { id: 'work', name: 'Work', entryIds: [] });
    const out = renameGroup(l, 'work', 'Professional');
    expect(out.groups[1].name).toBe('Professional');
    expect(out.groups[0].name).toBe('Modules');
  });
});

describe('toggleCollapsed', () => {
  it('toggles the collapsed flag', () => {
    const l = defaultLayout();
    const once = toggleCollapsed(l, 'main');
    const twice = toggleCollapsed(once, 'main');
    expect(once.groups[0].collapsed).toBe(true);
    expect(twice.groups[0].collapsed).toBe(false);
  });
});

describe('deleteGroup', () => {
  it('moves entries from the deleted group to the first remaining', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: ['whatsapp'] },
        { id: 'b', name: 'B', entryIds: ['telegram', 'messenger'] },
      ],
    };
    const out = deleteGroup(l, 'b');
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].entryIds).toEqual(['whatsapp', 'telegram', 'messenger']);
  });

  it('refuses to delete the only remaining group', () => {
    const l = defaultLayout();
    const out = deleteGroup(l, 'main');
    expect(out.groups).toHaveLength(1);
  });
});

describe('reorderGroups', () => {
  it('reorders groups by id', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: [] },
        { id: 'b', name: 'B', entryIds: [] },
        { id: 'c', name: 'C', entryIds: [] },
      ],
    };
    const out = reorderGroups(l, ['c', 'a', 'b']);
    expect(out.groups.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('appends unknown-to-order groups at the end', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: [] },
        { id: 'b', name: 'B', entryIds: [] },
      ],
    };
    const out = reorderGroups(l, ['b']);
    expect(out.groups.map((g) => g.id)).toEqual(['b', 'a']);
  });
});

describe('findGroup', () => {
  it('returns the group containing an entry', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', entryIds: ['whatsapp'] },
        { id: 'b', name: 'B', entryIds: ['telegram'] },
      ],
    };
    expect(findGroup(l, 'telegram')?.id).toBe('b');
  });

  it('returns null when not found', () => {
    expect(findGroup(defaultLayout(), 'nope')).toBeNull();
  });
});
