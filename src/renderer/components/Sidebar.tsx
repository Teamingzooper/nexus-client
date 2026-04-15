import React, { useMemo } from 'react';
import { useNexus } from '../store';

interface Props {
  onOpenSettings: () => void;
}

export function Sidebar({ onOpenSettings }: Props) {
  const modules = useNexus((s) => s.modules);
  const enabledIds = useNexus((s) => s.state.enabledModuleIds);
  const activeId = useNexus((s) => s.state.activeModuleId);
  const unread = useNexus((s) => s.unread);
  const activate = useNexus((s) => s.activate);

  const enabled = useMemo(
    () =>
      modules
        .filter((m) => enabledIds.includes(m.manifest.id))
        .sort((a, b) => {
          // Keep the active module at the order it was, but otherwise alphabetical.
          return a.manifest.name.localeCompare(b.manifest.name);
        }),
    [modules, enabledIds],
  );

  return (
    <nav className="sidebar" aria-label="Modules">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span className="sidebar-logo">N</span>
          <span>Nexus</span>
        </div>
      </div>

      <ul className="module-list" role="list">
        {enabled.map((m, index) => {
          const count = unread[m.manifest.id] ?? 0;
          const isActive = activeId === m.manifest.id;
          const shortcut = index < 9 ? `⌘${index + 1}` : '';
          return (
            <li key={m.manifest.id}>
              <button
                className={`module-item ${isActive ? 'active' : ''}`}
                onClick={() => activate(m.manifest.id)}
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
              </button>
            </li>
          );
        })}
        {enabled.length === 0 && (
          <li className="empty">
            No modules enabled. Open settings below to enable one.
          </li>
        )}
      </ul>

      <button className="settings-btn" onClick={onOpenSettings} title="Settings (⌘,)">
        <span aria-hidden="true">⚙</span> Settings
      </button>
    </nav>
  );
}
