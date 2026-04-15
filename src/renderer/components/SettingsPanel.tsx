import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { ThemeEditor } from './ThemeEditor';

interface Props {
  onClose: () => void;
}

type Tab = 'modules' | 'themes';

export function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('modules');

  useEffect(() => {
    window.nexus.setViewsSuspended(true);
    return () => {
      window.nexus.setViewsSuspended(false);
    };
  }, []);
  const modules = useNexus((s) => s.modules);
  const enabled = useNexus((s) => s.state.enabledModuleIds);
  const enable = useNexus((s) => s.enable);
  const disable = useNexus((s) => s.disable);
  const reload = useNexus((s) => s.reload);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="tabs">
            <button
              className={tab === 'modules' ? 'tab active' : 'tab'}
              onClick={() => setTab('modules')}
            >
              Modules
            </button>
            <button
              className={tab === 'themes' ? 'tab active' : 'tab'}
              onClick={() => setTab('themes')}
            >
              Themes
            </button>
          </div>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body">
          {tab === 'modules' && (
            <div>
              <div className="row-actions">
                <button onClick={() => reload()}>Reload modules</button>
                <button onClick={() => window.nexus.openModulesDir()}>
                  Open modules folder
                </button>
              </div>
              <ul className="module-settings">
                {modules.map((m) => {
                  const on = enabled.includes(m.manifest.id);
                  return (
                    <li key={m.manifest.id}>
                      <div className="module-info">
                        {m.iconDataUrl && <img src={m.iconDataUrl} alt="" />}
                        <div>
                          <div className="module-name">{m.manifest.name}</div>
                          <div className="module-meta">
                            v{m.manifest.version}
                            {m.manifest.author ? ` · ${m.manifest.author}` : ''}
                          </div>
                          {m.manifest.description && (
                            <div className="module-desc">{m.manifest.description}</div>
                          )}
                        </div>
                      </div>
                      <button
                        className={on ? 'toggle on' : 'toggle'}
                        onClick={() =>
                          on ? disable(m.manifest.id) : enable(m.manifest.id)
                        }
                      >
                        {on ? 'Enabled' : 'Enable'}
                      </button>
                    </li>
                  );
                })}
                {modules.length === 0 && <li className="empty">No modules found.</li>}
              </ul>
            </div>
          )}
          {tab === 'themes' && <ThemeEditor />}
        </div>
      </div>
    </div>
  );
}
