import React, { useEffect, useMemo, useState } from 'react';
import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';

interface Props {
  onClose: () => void;
}

interface Entry {
  id: string;
  name: string;
  version: string;
  author: string | null;
  description: string | null;
  url: string;
  zip: string;
}

type InstallState =
  | { state: 'idle' }
  | { state: 'installing' }
  | { state: 'installed' }
  | { state: 'error'; message: string };

/**
 * Modal that fetches the latest `community-v*` release from GitHub, lists
 * every module it carries, and installs selected ones into the user
 * modules folder via an IPC call. The main-process CommunityModulesService
 * does the actual download + unzip; this component just renders state.
 */
export function CommunityModulesBrowser({ onClose }: Props) {
  useOverlay();
  const modules = useNexus((s) => s.modules);
  const reloadModules = useNexus((s) => s.reloadModules);

  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listing, setListing] = useState<{
    tag: string;
    name: string;
    modules: Entry[];
  } | null>(null);
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({});

  const installedIds = useMemo(
    () => new Set(modules.map((m) => m.manifest.id)),
    [modules],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setListError(null);
    window.nexus
      .listCommunityModules()
      .then((result) => {
        if (!mounted) return;
        setListing(result);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setListError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const install = async (entry: Entry, overwrite: boolean) => {
    setInstallStates((s) => ({ ...s, [entry.id]: { state: 'installing' } }));
    try {
      await window.nexus.installCommunityModule(entry.id, overwrite);
      setInstallStates((s) => ({ ...s, [entry.id]: { state: 'installed' } }));
      // Refresh the main-app module list so the new module shows up in
      // Settings → Modules without requiring a reload.
      reloadModules().catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInstallStates((s) => ({
        ...s,
        [entry.id]: { state: 'error', message },
      }));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal community-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="community-header-title">
            <h2>Community modules</h2>
            {listing && <span className="community-tag">{listing.tag}</span>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <p className="editor-hint">
            Community modules are maintained by third parties and shipped as{' '}
            <code>.zip</code> files attached to a GitHub release on the Nexus
            repository. Only install modules you trust — an installed module
            runs in its own sandbox but can inject CSS and JavaScript into
            the web page it wraps.
          </p>

          {loading && <p>Loading available modules…</p>}

          {listError && (
            <p className="updates-error" role="alert">
              Couldn't reach the community-modules feed: {listError}
            </p>
          )}

          {listing && listing.modules.length === 0 && (
            <p className="editor-hint">
              The current community release ({listing.tag}) has no modules
              published.
            </p>
          )}

          {listing && listing.modules.length > 0 && (
            <ul className="community-list" role="list">
              {listing.modules.map((entry) => {
                const installed = installedIds.has(entry.id);
                const status = installStates[entry.id] ?? { state: 'idle' };
                return (
                  <li key={entry.id} className="community-item">
                    <div className="community-item-head">
                      <div className="community-item-title">{entry.name}</div>
                      <span className="community-item-version">
                        v{entry.version}
                      </span>
                    </div>
                    <div className="community-item-meta">
                      {entry.author && <span>by {entry.author}</span>}
                      {entry.author && ' · '}
                      <span>{hostOf(entry.url)}</span>
                    </div>
                    {entry.description && (
                      <div className="community-item-desc">{entry.description}</div>
                    )}
                    <div className="community-item-actions">
                      {status.state === 'installing' ? (
                        <button disabled>Installing…</button>
                      ) : installed || status.state === 'installed' ? (
                        <>
                          <span className="community-pill community-pill-ok">
                            Installed
                          </span>
                          <button onClick={() => install(entry, true)}>
                            Reinstall
                          </button>
                        </>
                      ) : (
                        <button onClick={() => install(entry, false)}>
                          Install
                        </button>
                      )}
                    </div>
                    {status.state === 'error' && (
                      <div className="community-item-error">
                        {status.message}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
