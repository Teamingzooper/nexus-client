import React from 'react';
import { useNexus } from '../store';

export function AppHeader() {
  const activeId = useNexus((s) => s.state.activeModuleId);
  const reloadActive = useNexus((s) => s.reloadActive);
  const modules = useNexus((s) => s.modules);

  const active = modules.find((m) => m.manifest.id === activeId);

  return (
    <header className="app-header" role="banner">
      <div className="app-header-left">
        <div className="sidebar-logo" aria-hidden="true">
          N
        </div>
        <div className="app-header-title">
          <span className="app-title">Nexus</span>
          {active && <span className="app-subtitle"> · {active.manifest.name}</span>}
        </div>
      </div>
      <div className="app-header-right">
        <button
          className="header-btn"
          onClick={() => reloadActive()}
          disabled={!activeId}
          title={activeId ? 'Reload active module (⌘R)' : 'No module selected'}
          aria-label="Reload active module"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
