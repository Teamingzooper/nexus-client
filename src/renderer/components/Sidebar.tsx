import React, { useMemo, useState } from 'react';
import { useNexus } from '../store';
import type {
  DropTarget,
  SidebarGroup,
  SidebarLayout,
  ModuleInstance,
  LoadedModule,
} from '../../shared/types';
import {
  addGroup,
  defaultLayout,
  deleteGroup,
  moveEntry,
  renameGroup,
  toggleCollapsed,
} from '../../shared/sidebarLayout';

const DRAG_MIME = 'application/x-nexus-instance';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

export function Sidebar() {
  const modules = useNexus((s) => s.modules);
  const instances = useNexus((s) => s.state.instances);
  const layout = useNexus((s) => s.state.sidebarLayout ?? defaultLayout());
  const activeId = useNexus((s) => s.state.activeInstanceId);
  const unread = useNexus((s) => s.unread);
  const compact = useNexus((s) => s.state.sidebarCompact ?? false);
  const activate = useNexus((s) => s.activateInstance);
  const removeInstance = useNexus((s) => s.removeInstance);
  const renameInstance = useNexus((s) => s.renameInstance);
  const updateLayout = useNexus((s) => s.updateLayout);
  const openAddInstance = useNexus((s) => s.openAddInstance);
  const showConfirm = useNexus((s) => s.showConfirm);
  const setInstanceMuted = useNexus((s) => s.setInstanceMuted);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  const instancesById = useMemo(() => {
    const map = new Map<string, ModuleInstance>();
    for (const i of instances) map.set(i.id, i);
    return map;
  }, [instances]);

  const modulesById = useMemo(() => {
    const map = new Map<string, LoadedModule>();
    for (const m of modules) map.set(m.manifest.id, m);
    return map;
  }, [modules]);

  const commit = (next: SidebarLayout) => {
    updateLayout(next).catch((err) => console.error('layout update failed', err));
  };

  const onDragStart = (e: React.DragEvent, instanceId: string) => {
    e.dataTransfer.setData(DRAG_MIME, instanceId);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(instanceId);
  };

  const onDragEnd = () => {
    setDragId(null);
    setDropHint(null);
  };

  const onItemDragOver = (e: React.DragEvent, groupId: string, entryId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    setDropHint(`${groupId}:${entryId}:${above ? 'before' : 'after'}`);
  };

  const onItemDrop = (e: React.DragEvent, groupId: string, entryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragged = e.dataTransfer.getData(DRAG_MIME);
    if (!dragged || dragged === entryId) {
      onDragEnd();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    const target: DropTarget = {
      kind: above ? 'before' : 'after',
      groupId,
      entryId,
    };
    commit(moveEntry(layout, dragged, target));
    onDragEnd();
  };

  const onGroupDragOver = (e: React.DragEvent, groupId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHint(`${groupId}:append`);
  };

  const onGroupDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    const dragged = e.dataTransfer.getData(DRAG_MIME);
    if (!dragged) {
      onDragEnd();
      return;
    }
    commit(moveEntry(layout, dragged, { kind: 'group-append', groupId }));
    onDragEnd();
  };

  const onRemove = async (instance: ModuleInstance) => {
    const ok = await showConfirm({
      title: `Delete ${instance.name}?`,
      message:
        'This instance will be removed from the sidebar and all of its session data (cookies, login state, local storage) will be permanently erased. This cannot be undone.',
      confirmLabel: 'Delete and wipe data',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeInstance(instance.id);
    } catch (err) {
      console.error('remove failed', err);
    }
  };

  const onAddGroup = () => {
    const existingIds = new Set(layout.groups.map((g) => g.id));
    let n = layout.groups.length;
    let id: string;
    let name: string;
    do {
      n += 1;
      name = n === 1 ? 'Group' : `Group ${n}`;
      id = slugify(name) || `group-${Date.now()}`;
    } while (existingIds.has(id));
    commit(addGroup(layout, { id, name, entryIds: [] }));
    setEditingGroupId(id);
  };

  const onRenameGroup = (groupId: string, name: string) => {
    setEditingGroupId(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    commit(renameGroup(layout, groupId, trimmed));
  };

  const onRenameInstance = (instanceId: string, name: string) => {
    setEditingInstanceId(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    renameInstance(instanceId, trimmed).catch((err) =>
      console.error('rename failed', err),
    );
  };

  const onToggleGroup = (groupId: string) => {
    commit(toggleCollapsed(layout, groupId));
  };

  const onDeleteGroup = async (group: SidebarGroup) => {
    if (layout.groups.length <= 1) return;
    const n = group.entryIds.length;
    const ok = await showConfirm({
      title: `Delete group "${group.name}"?`,
      message:
        n > 0
          ? `This group contains ${n} instance${n === 1 ? '' : 's'}. They will be moved into the first remaining group (their data is not affected).`
          : 'This group is empty. It will be removed from the sidebar.',
      confirmLabel: 'Delete group',
      danger: true,
    });
    if (!ok) return;
    commit(deleteGroup(layout, group.id));
  };

  return (
    <nav
      className={`sidebar ${compact ? 'compact' : ''}`}
      aria-label="Modules"
    >
      <div className="sidebar-scroll">
        {layout.groups.map((group) => {
          const isEditing = editingGroupId === group.id;
          const entries = group.entryIds
            .map((id) => instancesById.get(id))
            .filter((i): i is ModuleInstance => !!i);
          const isDropTarget = dropHint === `${group.id}:append`;

          return (
            <section
              key={group.id}
              className={`sidebar-group ${group.collapsed ? 'collapsed' : ''} ${isDropTarget ? 'drop-target' : ''}`}
              onDragOver={(e) => onGroupDragOver(e, group.id)}
              onDrop={(e) => onGroupDrop(e, group.id)}
              onDragLeave={(e) => {
                const rt = e.relatedTarget as Node | null;
                if (!rt || !(e.currentTarget as Node).contains(rt)) {
                  setDropHint((h) => (h === `${group.id}:append` ? null : h));
                }
              }}
            >
              <header className="group-header">
                <button
                  className="group-toggle"
                  onClick={() => onToggleGroup(group.id)}
                  aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
                  aria-expanded={!group.collapsed}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path
                      d="M3 1l4 4-4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {isEditing ? (
                  <input
                    autoFocus
                    className="group-rename-input"
                    defaultValue={group.name}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => onRenameGroup(group.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingGroupId(null);
                    }}
                  />
                ) : (
                  <button
                    className="group-name"
                    onDoubleClick={() => setEditingGroupId(group.id)}
                    title="Double-click to rename"
                  >
                    {group.name}
                    <span className="group-count">{entries.length}</span>
                  </button>
                )}
                {layout.groups.length > 1 && (
                  <button
                    className="group-delete"
                    onClick={() => onDeleteGroup(group)}
                    title="Delete group"
                    aria-label={`Delete group ${group.name}`}
                  >
                    ×
                  </button>
                )}
              </header>
              {!group.collapsed && (
                <ul className="module-list" role="list">
                  {entries.map((instance) => {
                    const m = modulesById.get(instance.moduleId);
                    const count = unread[instance.id] ?? 0;
                    const isActive = activeId === instance.id;
                    const hintKey = `${group.id}:${instance.id}`;
                    const showAbove = dropHint === `${hintKey}:before`;
                    const showBelow = dropHint === `${hintKey}:after`;
                    const dropPos = showAbove ? 'before' : showBelow ? 'after' : null;
                    const isRenaming = editingInstanceId === instance.id;
                    return (
                      <li
                        key={instance.id}
                        className={`module-li ${dragId === instance.id ? 'dragging' : ''}`}
                        data-drop={dropPos ?? undefined}
                        onDragOver={(e) => onItemDragOver(e, group.id, instance.id)}
                        onDrop={(e) => onItemDrop(e, group.id, instance.id)}
                      >
                        <div
                          className={`module-item ${isActive ? 'active' : ''}`}
                          draggable={!isRenaming}
                          onDragStart={(e) => onDragStart(e, instance.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => {
                            if (!isRenaming) activate(instance.id);
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            setEditingInstanceId(instance.id);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (isRenaming) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              activate(instance.id);
                            }
                            if (e.key === 'F2') {
                              e.preventDefault();
                              setEditingInstanceId(instance.id);
                            }
                          }}
                          title={`${instance.name} — double-click to rename`}
                          aria-pressed={isActive}
                        >
                          <span className="module-icon" aria-hidden="true">
                            {m?.iconDataUrl ? (
                              <img src={m.iconDataUrl} alt="" draggable={false} />
                            ) : (
                              <span>{instance.name.slice(0, 1).toUpperCase()}</span>
                            )}
                          </span>
                          {isRenaming ? (
                            <input
                              autoFocus
                              className="instance-rename-input"
                              defaultValue={instance.name}
                              onFocus={(e) => e.currentTarget.select()}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => onRenameInstance(instance.id, e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setEditingInstanceId(null);
                              }}
                            />
                          ) : (
                            <span className="module-name">{instance.name}</span>
                          )}
                          {count > 0 && !isRenaming && (
                            <span
                              className={`badge${instance.muted ? ' badge-muted' : ''}`}
                              aria-label={`${count} unread`}
                            >
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                          {!isRenaming && (
                            <button
                              className={`module-mute${instance.muted ? ' is-muted' : ''}`}
                              title={
                                instance.muted
                                  ? 'Unmute this instance'
                                  : 'Mute this instance'
                              }
                              aria-label={
                                instance.muted ? `Unmute ${instance.name}` : `Mute ${instance.name}`
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setInstanceMuted(instance.id, !instance.muted);
                              }}
                            >
                              {instance.muted ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                  <line x1="23" y1="9" x2="17" y2="15" />
                                  <line x1="17" y1="9" x2="23" y2="15" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                </svg>
                              )}
                            </button>
                          )}
                          {!isRenaming && (
                            <button
                              className="module-remove"
                              title="Remove from sidebar"
                              aria-label={`Remove ${instance.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemove(instance);
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {entries.length === 0 && (
                    <li className="group-empty">Drop an instance here</li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button
          className="sidebar-action"
          onClick={openAddInstance}
          title="Add an instance of a module"
        >
          + Instance
        </button>
        <button className="sidebar-action" onClick={onAddGroup} title="New group">
          + Group
        </button>
      </div>
    </nav>
  );
}
