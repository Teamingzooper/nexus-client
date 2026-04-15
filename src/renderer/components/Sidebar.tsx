import React from 'react';
import { useNexus } from '../store';

interface Props {
  onOpenSettings: () => void;
}

export function Sidebar({ onOpenSettings }: Props) {
  const modules = useNexus((s) => s.modules);
  const enabled = useNexus((s) => s.state.enabledModuleIds);
  const activeId = useNexus((s) => s.state.activeModuleId);
  const unread = useNexus((s) => s.unread);
  const activate = useNexus((s) => s.activate);

  const enabledModules = modules.filter((m) => enabled.includes(m.manifest.id));

  return (
    <nav className="sidebar" aria-label="modules">
      <div className="sidebar-title">Nexus</div>
      <ul className="module-list">
        {enabledModules.map((m) => {
          const count = unread[m.manifest.id] ?? 0;
          const isActive = activeId === m.manifest.id;
          return (
            <li key={m.manifest.id}>
              <button
                className={`module-item ${isActive ? 'active' : ''}`}
                onClick={() => activate(m.manifest.id)}
                title={m.manifest.name}
              >
                <span className="module-icon">
                  {m.iconDataUrl ? (
                    <img src={m.iconDataUrl} alt="" />
                  ) : (
                    <span>{m.manifest.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="module-name">{m.manifest.name}</span>
                {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
              </button>
            </li>
          );
        })}
        {enabledModules.length === 0 && (
          <li className="empty">No modules enabled. Open settings to add one.</li>
        )}
      </ul>
      <button className="settings-btn" onClick={onOpenSettings}>
        ⚙ Settings
      </button>
    </nav>
  );
}
