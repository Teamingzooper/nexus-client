import React from 'react';
import { useNexus } from '../store';

interface Props {
  onOpenSettings: () => void;
}

export function AppHeader({ onOpenSettings }: Props) {
  const activeId = useNexus((s) => s.state.activeInstanceId);
  const reloadActive = useNexus((s) => s.reloadActiveInstance);
  const instances = useNexus((s) => s.state.instances);

  const active = instances.find((i) => i.id === activeId);

  return (
    <header className="app-header" role="banner">
      <div className="app-header-left">
        <div className="sidebar-logo" aria-hidden="true">
          N
        </div>
        <button
          className="header-btn header-settings-btn"
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          aria-label="Open settings"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
        <div className="app-header-title">
          <span className="app-title">Nexus</span>
          {active && <span className="app-subtitle"> · {active.name}</span>}
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
