import { describe, it, expect } from 'vitest';
import {
  addGroup,
  defaultLayout,
  deleteGroup,
  findGroup,
  moveModule,
  reconcile,
  removeModule,
  renameGroup,
  reorderGroups,
  toggleCollapsed,
} from '../../src/shared/sidebarLayout';

describe('defaultLayout', () => {
  it('has one empty group', () => {
    const l = defaultLayout();
    expect(l.groups).toHaveLength(1);
    expect(l.groups[0].moduleIds).toEqual([]);
  });
});

describe('reconcile', () => {
  it('appends new enabled modules to the first group', () => {
    const l = defaultLayout();
    const out = reconcile(l, ['whatsapp', 'telegram']);
    expect(out.groups[0].moduleIds).toEqual(['whatsapp', 'telegram']);
  });

  it('prunes disabled modules from all groups', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', moduleIds: ['whatsapp', 'telegram'] },
        { id: 'b', name: 'B', moduleIds: ['messenger'] },
      ],
    };
    const out = reconcile(l, ['whatsapp']);
    expect(out.groups[0].moduleIds).toEqual(['whatsapp']);
    expect(out.groups[1].moduleIds).toEqual([]);
  });

  it('deduplicates if the same id appears in two groups', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', moduleIds: ['whatsapp'] },
        { id: 'b', name: 'B', moduleIds: ['whatsapp'] },
      ],
    };
    const out = reconcile(l, ['whatsapp']);
    expect(out.groups[0].moduleIds).toEqual(['whatsapp']);
    expect(out.groups[1].moduleIds).toEqual([]);
  });

  it('creates a default group when layout has none', () => {
    const out = reconcile({ groups: [] as any }, ['whatsapp']);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].moduleIds).toEqual(['whatsapp']);
  });
});

describe('moveModule', () => {
  const base = {
    groups: [
      { id: 'a', name: 'A', moduleIds: ['whatsapp', 'telegram', 'signal'] },
      { id: 'b', name: 'B', moduleIds: ['messenger'] },
    ],
  };

  it('moves within a group (before)', () => {
    const out = moveModule(base, 'signal', { kind: 'before', groupId: 'a', moduleId: 'whatsapp' });
    expect(out.groups[0].moduleIds).toEqual(['signal', 'whatsapp', 'telegram']);
  });

  it('moves within a group (after)', () => {
    const out = moveModule(base, 'whatsapp', { kind: 'after', groupId: 'a', moduleId: 'signal' });
    expect(out.groups[0].moduleIds).toEqual(['telegram', 'signal', 'whatsapp']);
  });

  it('moves across groups', () => {
    const out = moveModule(base, 'signal', { kind: 'group-append', groupId: 'b' });
    expect(out.groups[0].moduleIds).toEqual(['whatsapp', 'telegram']);
    expect(out.groups[1].moduleIds).toEqual(['messenger', 'signal']);
  });

  it('moves before a specific item in another group', () => {
    const out = moveModule(base, 'telegram', {
      kind: 'before',
      groupId: 'b',
      moduleId: 'messenger',
    });
    expect(out.groups[0].moduleIds).toEqual(['whatsapp', 'signal']);
    expect(out.groups[1].moduleIds).toEqual(['telegram', 'messenger']);
  });

  it('is a no-op when dropping on itself', () => {
    // Removed then re-inserted at same spot yields same order.
    const out = moveModule(base, 'whatsapp', {
      kind: 'before',
      groupId: 'a',
      moduleId: 'telegram',
    });
    expect(out.groups[0].moduleIds).toEqual(['whatsapp', 'telegram', 'signal']);
  });
});

describe('removeModule', () => {
  it('removes from wherever the module lives', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', moduleIds: ['whatsapp'] },
        { id: 'b', name: 'B', moduleIds: ['telegram'] },
      ],
    };
    expect(removeModule(l, 'telegram').groups[1].moduleIds).toEqual([]);
    expect(removeModule(l, 'whatsapp').groups[0].moduleIds).toEqual([]);
  });
});

describe('addGroup', () => {
  it('appends a new group', () => {
    const l = defaultLayout();
    const out = addGroup(l, { id: 'work', name: 'Work', moduleIds: [] });
    expect(out.groups).toHaveLength(2);
    expect(out.groups[1].id).toBe('work');
  });

  it('is a no-op when id already exists', () => {
    const l = defaultLayout();
    const once = addGroup(l, { id: 'work', name: 'Work', moduleIds: [] });
    const twice = addGroup(once, { id: 'work', name: 'Other', moduleIds: [] });
    expect(twice.groups).toHaveLength(2);
    expect(twice.groups[1].name).toBe('Work');
  });
});

describe('renameGroup', () => {
  it('updates only the target group', () => {
    const l = addGroup(defaultLayout(), { id: 'work', name: 'Work', moduleIds: [] });
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
  it('moves modules from the deleted group to the first remaining', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', moduleIds: ['whatsapp'] },
        { id: 'b', name: 'B', moduleIds: ['telegram', 'messenger'] },
      ],
    };
    const out = deleteGroup(l, 'b');
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].moduleIds).toEqual(['whatsapp', 'telegram', 'messenger']);
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
        { id: 'a', name: 'A', moduleIds: [] },
        { id: 'b', name: 'B', moduleIds: [] },
        { id: 'c', name: 'C', moduleIds: [] },
      ],
    };
    const out = reorderGroups(l, ['c', 'a', 'b']);
    expect(out.groups.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('appends unknown-to-order groups at the end', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', moduleIds: [] },
        { id: 'b', name: 'B', moduleIds: [] },
      ],
    };
    const out = reorderGroups(l, ['b']);
    expect(out.groups.map((g) => g.id)).toEqual(['b', 'a']);
  });
});

describe('findGroup', () => {
  it('returns the group containing a module', () => {
    const l = {
      groups: [
        { id: 'a', name: 'A', moduleIds: ['whatsapp'] },
        { id: 'b', name: 'B', moduleIds: ['telegram'] },
      ],
    };
    expect(findGroup(l, 'telegram')?.id).toBe('b');
  });

  it('returns null when not found', () => {
    expect(findGroup(defaultLayout(), 'nope')).toBeNull();
  });
});
