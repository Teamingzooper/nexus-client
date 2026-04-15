import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { nextInstanceName } from '../../shared/instance';

export function AddInstanceDialog() {
  const open = useNexus((s) => s.addInstanceOpen);
  const close = useNexus((s) => s.closeAddInstance);
  const modules = useNexus((s) => s.modules);
  const instances = useNexus((s) => s.state.instances);
  const addInstance = useNexus((s) => s.addInstance);
  const renameInstance = useNexus((s) => s.renameInstance);
  const activateInstance = useNexus((s) => s.activateInstance);

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedModuleId(null);
      setName('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const selected = modules.find((m) => m.manifest.id === selectedModuleId);

  const chooseModule = (moduleId: string) => {
    const mod = modules.find((m) => m.manifest.id === moduleId);
    if (!mod) return;
    const existingNames = instances
      .filter((i) => i.moduleId === moduleId)
      .map((i) => i.name);
    setSelectedModuleId(moduleId);
    setName(nextInstanceName(mod.manifest.name, existingNames));
    setError(null);
  };

  const back = () => {
    setSelectedModuleId(null);
    setName('');
    setError(null);
  };

  const create = async () => {
    if (!selectedModuleId) return;
    const finalName = name.trim();
    if (!finalName) {
      setError('Name cannot be empty.');
      return;
    }
    setBusy(true);
    try {
      const instance = await addInstance(selectedModuleId);
      if (instance.name !== finalName) {
        await renameInstance(instance.id, finalName);
      }
      await activateInstance(instance.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-instance-title"
    >
      <div className="modal add-instance-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="add-instance-title">
            {selected ? `Add ${selected.manifest.name}` : 'Add Instance'}
          </h2>
          <button className="close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          {!selected ? (
            <>
              <p className="editor-hint">
                Pick a module to create a new instance of. Each instance has its own
                isolated session — perfect for logging into two accounts.
              </p>
              <ul className="module-picker" role="list">
                {modules.map((m) => (
                  <li key={m.manifest.id}>
                    <button
                      className="module-picker-item"
                      onClick={() => chooseModule(m.manifest.id)}
                    >
                      {m.iconDataUrl ? (
                        <img src={m.iconDataUrl} alt="" />
                      ) : (
                        <div className="icon-placeholder">
                          {m.manifest.name.slice(0, 1)}
                        </div>
                      )}
                      <div className="module-picker-info">
                        <div className="module-name">{m.manifest.name}</div>
                        {m.manifest.description && (
                          <div className="module-desc">{m.manifest.description}</div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
                {modules.length === 0 && (
                  <li className="empty">No modules available.</li>
                )}
              </ul>
            </>
          ) : (
            <div className="add-instance-form">
              <div className="selected-module">
                {selected.iconDataUrl ? (
                  <img src={selected.iconDataUrl} alt="" />
                ) : (
                  <div className="icon-placeholder">
                    {selected.manifest.name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <div className="module-name">{selected.manifest.name}</div>
                  <div className="module-meta">v{selected.manifest.version}</div>
                </div>
              </div>
              <label className="theme-field">
                <span>Name</span>
                <input
                  autoFocus
                  className="theme-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') create();
                  }}
                  placeholder="e.g. Work, Personal"
                  disabled={busy}
                />
              </label>
              {error && <div className="error-message">{error}</div>}
              <div className="confirm-actions">
                <button onClick={back} disabled={busy}>
                  ← Back
                </button>
                <button
                  className="confirm-ok"
                  onClick={create}
                  disabled={busy || !name.trim()}
                >
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
