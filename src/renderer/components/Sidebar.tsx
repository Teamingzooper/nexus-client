import React, { useMemo, useState } from 'react';
import { useNexus } from '../store';
import type { DropTarget, SidebarGroup, SidebarLayout } from '../../shared/types';
import {
  addGroup,
  defaultLayout,
  deleteGroup,
  moveModule,
  renameGroup,
  toggleCollapsed,
} from '../../shared/sidebarLayout';

interface Props {
  onOpenSettings: () => void;
}

const DRAG_MIME = 'application/x-nexus-module';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

export function Sidebar({ onOpenSettings }: Props) {
  const modules = useNexus((s) => s.modules);
  const layout = useNexus((s) => s.state.sidebarLayout ?? defaultLayout());
  const activeId = useNexus((s) => s.state.activeModuleId);
  const unread = useNexus((s) => s.unread);
  const activate = useNexus((s) => s.activate);
  const disable = useNexus((s) => s.disable);
  const updateLayout = useNexus((s) => s.updateLayout);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const modulesById = useMemo(() => {
    const map = new Map<string, (typeof modules)[number]>();
    for (const m of modules) map.set(m.manifest.id, m);
    return map;
  }, [modules]);

  const orderedShortcut = useMemo(() => {
    const out: string[] = [];
    for (const g of layout.groups) {
      for (const id of g.moduleIds) out.push(id);
    }
    return out;
  }, [layout]);

  const commit = (next: SidebarLayout) => {
    updateLayout(next).catch((err) => console.error('layout update failed', err));
  };

  const onDragStart = (e: React.DragEvent, moduleId: string) => {
    e.dataTransfer.setData(DRAG_MIME, moduleId);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(moduleId);
  };

  const onDragEnd = () => {
    setDragId(null);
    setDropHint(null);
  };

  const onItemDragOver = (e: React.DragEvent, groupId: string, moduleId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    setDropHint(`${groupId}:${moduleId}:${above ? 'before' : 'after'}`);
  };

  const onItemDrop = (e: React.DragEvent, groupId: string, moduleId: string) => {
    e.preventDefault();
    const dragged = e.dataTransfer.getData(DRAG_MIME);
    if (!dragged || dragged === moduleId) {
      onDragEnd();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    const target: DropTarget = {
      kind: above ? 'before' : 'after',
      groupId,
      moduleId,
    };
    commit(moveModule(layout, dragged, target));
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
    commit(moveModule(layout, dragged, { kind: 'group-append', groupId }));
    onDragEnd();
  };

  const onRemove = (moduleId: string) => {
    disable(moduleId).catch((err) => console.error('disable failed', err));
  };

  const onAddGroup = () => {
    const name = window.prompt('New group name', 'Group');
    if (!name) return;
    const id = slugify(name) || `group-${Date.now()}`;
    commit(addGroup(layout, { id, name, moduleIds: [] }));
  };

  const onRenameGroup = (groupId: string, name: string) => {
    setEditingGroupId(null);
    if (!name.trim()) return;
    commit(renameGroup(layout, groupId, name.trim()));
  };

  const onToggleGroup = (groupId: string) => {
    commit(toggleCollapsed(layout, groupId));
  };

  const onDeleteGroup = (group: SidebarGroup) => {
    if (layout.groups.length <= 1) return;
    if (group.moduleIds.length > 0) {
      const ok = window.confirm(
        `Delete group "${group.name}"? Its modules will move to the first group.`,
      );
      if (!ok) return;
    }
    commit(deleteGroup(layout, group.id));
  };

  return (
    <nav className="sidebar" aria-label="Modules">
      <div className="sidebar-scroll">
        {layout.groups.map((group) => {
          const visibleModules = group.moduleIds
            .map((id) => modulesById.get(id))
            .filter((m): m is NonNullable<typeof m> => !!m);
          const isEditing = editingGroupId === group.id;

          return (
            <section
              key={group.id}
              className={`sidebar-group ${group.collapsed ? 'collapsed' : ''}`}
              onDragOver={(e) => onGroupDragOver(e, group.id)}
              onDrop={(e) => onGroupDrop(e, group.id)}
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
                    <span className="group-count">{visibleModules.length}</span>
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
                  {visibleModules.map((m) => {
                    const count = unread[m.manifest.id] ?? 0;
                    const isActive = activeId === m.manifest.id;
                    const shortcutIdx = orderedShortcut.indexOf(m.manifest.id);
                    const shortcut =
                      shortcutIdx >= 0 && shortcutIdx < 9 ? `⌘${shortcutIdx + 1}` : '';
                    const hintKey = `${group.id}:${m.manifest.id}`;
                    const showAbove = dropHint === `${hintKey}:before`;
                    const showBelow = dropHint === `${hintKey}:after`;
                    return (
                      <li
                        key={m.manifest.id}
                        className={`module-li ${dragId === m.manifest.id ? 'dragging' : ''}`}
                      >
                        {showAbove && <div className="drop-indicator" />}
                        <div
                          className={`module-item ${isActive ? 'active' : ''}`}
                          draggable
                          onDragStart={(e) => onDragStart(e, m.manifest.id)}
                          onDragEnd={onDragEnd}
                          onDragOver={(e) => onItemDragOver(e, group.id, m.manifest.id)}
                          onDrop={(e) => onItemDrop(e, group.id, m.manifest.id)}
                          onClick={() => activate(m.manifest.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              activate(m.manifest.id);
                            }
                          }}
                          title={`${m.manifest.name}${shortcut ? ` (${shortcut})` : ''}`}
                          aria-pressed={isActive}
                        >
                          <span className="module-icon" aria-hidden="true">
                            {m.iconDataUrl ? (
                              <img src={m.iconDataUrl} alt="" draggable={false} />
                            ) : (
                              <span>{m.manifest.name.slice(0, 1)}</span>
                            )}
                          </span>
                          <span className="module-name">{m.manifest.name}</span>
                          {count > 0 && (
                            <span className="badge" aria-label={`${count} unread`}>
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                          <button
                            className="module-remove"
                            title="Remove from sidebar"
                            aria-label={`Remove ${m.manifest.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemove(m.manifest.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                        {showBelow && <div className="drop-indicator" />}
                      </li>
                    );
                  })}
                  {visibleModules.length === 0 && (
                    <li className="group-empty">Drop a module here</li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-action" onClick={onAddGroup} title="New group">
          + Group
        </button>
        <button
          className="settings-btn"
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          aria-label="Open settings"
        >
          <span aria-hidden="true">⚙</span> Settings
        </button>
      </div>
    </nav>
  );
}
