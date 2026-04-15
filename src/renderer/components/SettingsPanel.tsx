import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { ThemeEditor } from './ThemeEditor';

interface Props {
  onClose: () => void;
}

type Tab = 'modules' | 'themes' | 'about';

export function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('modules');
  const modules = useNexus((s) => s.modules);
  const enabled = useNexus((s) => s.state.enabledModuleIds);
  const enableModule = useNexus((s) => s.enable);
  const disableModule = useNexus((s) => s.disable);
  const reload = useNexus((s) => s.reload);

  useEffect(() => {
    window.nexus.setViewsSuspended(true).catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.nexus.setViewsSuspended(false).catch(() => {});
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'modules'}
              className={tab === 'modules' ? 'tab active' : 'tab'}
              onClick={() => setTab('modules')}
            >
              Modules
            </button>
            <button
              role="tab"
              aria-selected={tab === 'themes'}
              className={tab === 'themes' ? 'tab active' : 'tab'}
              onClick={() => setTab('themes')}
            >
              Themes
            </button>
            <button
              role="tab"
              aria-selected={tab === 'about'}
              className={tab === 'about' ? 'tab active' : 'tab'}
              onClick={() => setTab('about')}
            >
              About
            </button>
          </div>
          <button className="close" onClick={onClose} aria-label="Close settings">
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
              <ul className="module-settings" role="list">
                {modules.map((m) => {
                  const on = enabled.includes(m.manifest.id);
                  return (
                    <li key={m.manifest.id}>
                      <div className="module-info">
                        {m.iconDataUrl ? (
                          <img src={m.iconDataUrl} alt="" />
                        ) : (
                          <div className="icon-placeholder">
                            {m.manifest.name.slice(0, 1)}
                          </div>
                        )}
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
                          on ? disableModule(m.manifest.id) : enableModule(m.manifest.id)
                        }
                        aria-pressed={on}
                      >
                        {on ? 'Enabled' : 'Enable'}
                      </button>
                    </li>
                  );
                })}
                {modules.length === 0 && (
                  <li className="empty">
                    No modules found. Click "Open modules folder" to add one.
                  </li>
                )}
              </ul>
            </div>
          )}
          {tab === 'themes' && <ThemeEditor />}
          {tab === 'about' && (
            <div className="about">
              <h2>Nexus</h2>
              <p>A modular, moddable desktop messaging client.</p>
              <dl className="shortcuts">
                <dt>
                  <kbd>⌘,</kbd>
                </dt>
                <dd>Toggle settings</dd>
                <dt>
                  <kbd>⌘R</kbd>
                </dt>
                <dd>Reload active module</dd>
                <dt>
                  <kbd>⌘1</kbd>–<kbd>⌘9</kbd>
                </dt>
                <dd>Jump to module</dd>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>Close settings</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
