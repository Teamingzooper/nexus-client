import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';

interface CommunityScript {
  filename: string;
  type: 'js' | 'css';
  name: string;
  description: string | null;
  author: string | null;
  version: string | null;
  module: string | null;
  matches: string[];
  runAt: string;
}

interface Props {
  onClose: () => void;
  onInstalled: () => void;
}

type InstallState = { status: 'idle' } | { status: 'installing' } | { status: 'installed' } | { status: 'error'; message: string };

export function CommunityUserscriptsBrowser({ onClose, onInstalled }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState<string>('');
  const [scripts, setScripts] = useState<CommunityScript[]>([]);
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({});
  const [installedFilenames, setInstalledFilenames] = useState<Set<string>>(new Set());
  const modules = useNexus((s) => s.modules);
  const showConfirm = useNexus((s) => s.showConfirm);

  // Track which community-named files already exist in the user's folder so
  // we can render "Already installed" / "Replace" instead of just "Install".
  useEffect(() => {
    const refresh = async () => {
      try {
        const list = await window.nexus.listUserscripts();
        setInstalledFilenames(new Set(list.map((s) => s.filename)));
      } catch {
        // non-fatal — worst case we show "Install" on something already present
      }
    };
    refresh();
    const off = window.nexus.onUserscriptsChanged((list) => {
      setInstalledFilenames(new Set(list.map((s) => s.filename)));
    });
    return off;
  }, []);

  useOverlay();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    window.nexus
      .listCommunityUserscripts()
      .then((listing) => {
        if (!mounted) return;
        setTag(listing.tag);
        setScripts(listing.scripts as CommunityScript[]);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setInstallStatus = (filename: string, state: InstallState) => {
    setInstallStates((prev) => ({ ...prev, [filename]: state }));
  };

  const install = async (s: CommunityScript) => {
    const already = installedFilenames.has(s.filename);
    if (already) {
      const ok = await showConfirm({
        title: `Replace ${s.filename}?`,
        message:
          'You already have a userscript with that filename. Installing the community version will overwrite your local file. Your enable/disable state is preserved.',
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    setInstallStatus(s.filename, { status: 'installing' });
    try {
      await window.nexus.installCommunityUserscript(s.filename, already);
      setInstallStatus(s.filename, { status: 'installed' });
      onInstalled();
    } catch (err) {
      setInstallStatus(s.filename, {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const moduleLabel = (id: string | null) =>
    id ? (modules.find((m) => m.manifest.id === id)?.manifest.name ?? id) : 'any service';

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal modal-community" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Browse community userscripts</h3>
            {tag && (
              <div style={{ fontSize: 12, color: 'var(--nx-text-muted)', marginTop: 2 }}>
                Catalogue: {tag}
              </div>
            )}
          </div>
          <button className="close" onClick={onClose} aria-label="Close community browser">
            ×
          </button>
        </header>

        <div className="modal-body">
          {loading && <p className="editor-hint">Loading catalogue…</p>}
          {error && (
            <p className="updates-error" role="alert">
              Couldn't load the community catalogue: {error}
            </p>
          )}

          {!loading && !error && scripts.length === 0 && (
            <p className="editor-hint">
              No community scripts are published yet. Contribute one via the{' '}
              <code>community-userscripts/</code> folder on GitHub.
            </p>
          )}

          <ul className="community-list" role="list">
            {scripts.map((s) => {
              const state: InstallState = installStates[s.filename] ?? { status: 'idle' };
              const already = installedFilenames.has(s.filename);
              return (
                <li key={s.filename} className="community-item">
                  <div className="community-item-info">
                    <div className="community-item-name">
                      <span className={`userscripts-badge ${s.type}`}>
                        {s.type.toUpperCase()}
                      </span>
                      {s.name}
                    </div>
                    {s.description && (
                      <div className="community-item-desc">{s.description}</div>
                    )}
                    <div className="community-item-meta">
                      {moduleLabel(s.module)}
                      {s.version ? ` · v${s.version}` : ''}
                      {s.author ? ` · by ${s.author}` : ''}
                      {` · ${s.filename}`}
                    </div>
                  </div>
                  <div className="community-item-actions">
                    {state.status === 'installed' || (state.status === 'idle' && already) ? (
                      <span className="community-pill community-pill-ok">
                        {state.status === 'installed' ? 'Installed' : 'Already installed'}
                      </span>
                    ) : (
                      <button
                        className="toggle on"
                        onClick={() => install(s)}
                        disabled={state.status === 'installing'}
                      >
                        {state.status === 'installing' ? 'Installing…' : already ? 'Replace' : 'Install'}
                      </button>
                    )}
                  </div>
                  {state.status === 'error' && (
                    <div className="community-item-error">{state.message}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
