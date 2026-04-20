import React, { useEffect, useState } from 'react';
import type { UpdateStatus } from '../nexus';

type AppInfo = { version: string; isPackaged: boolean };

/**
 * Settings → Updates. Manual check-for-updates UI backed by the main-process
 * UpdaterService (electron-updater, pointed at the GitHub release feed in
 * package.json).
 *
 * Per release, shows: release name (falls back to version), version number,
 * release date, and the changelog body from the GitHub release. The "Install
 * and restart" button calls updater.quitAndInstall() once the payload is on
 * disk; electron-updater applies the update in-place, so existing module
 * partitions (cookies/logins) survive.
 *
 * In dev (app.isPackaged === false) the updater is intentionally disabled
 * because the latest-*.yml manifests only exist for tagged GitHub releases.
 * We show a note instead of silently pretending nothing happened.
 */
export function UpdatesTab() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [checking, setChecking] = useState(false);
  const [lastCheckError, setLastCheckError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    window.nexus.getAppVersion().then(
      (info) => {
        if (mounted) setAppInfo(info);
      },
      () => {},
    );
    window.nexus.getUpdaterStatus().then(
      (s) => {
        if (mounted) setStatus(s);
      },
      () => {},
    );

    const off = window.nexus.onUpdaterStatus((s) => {
      if (!mounted) return;
      setStatus(s);
      // Checking state comes from the backend; flip our local spinner off
      // once the backend has settled into a terminal state.
      if (s.state !== 'checking') setChecking(false);
      if (s.state !== 'error') setLastCheckError(null);
      else setLastCheckError(s.message);
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  const onCheck = async () => {
    setLastCheckError(null);
    setChecking(true);
    try {
      const result = await window.nexus.checkForUpdates();
      // Backend returns its current status after the check completes; use it
      // as the authoritative snapshot instead of waiting for the subscription.
      setStatus(result);
      if (result.state !== 'checking') setChecking(false);
      if (result.state === 'error') setLastCheckError(result.message);
    } catch (err) {
      setChecking(false);
      setLastCheckError(err instanceof Error ? err.message : String(err));
    }
  };

  const onInstall = () => {
    window.nexus.installUpdate().catch((err) => {
      setLastCheckError(err instanceof Error ? err.message : String(err));
    });
  };

  const currentVersion = appInfo?.version ?? '—';
  const isPackaged = appInfo?.isPackaged ?? false;

  return (
    <div className="updates-tab">
      <div className="updates-current">
        <div className="updates-label">Current version</div>
        <div className="updates-version">Nexus v{currentVersion}</div>
      </div>

      {!isPackaged && appInfo && (
        <p className="editor-hint">
          Updates are disabled in development builds. Run the packaged app
          (<code>npm run launch</code>) to see the updater in action — it
          reads from the GitHub release feed configured in{' '}
          <code>package.json</code>.
        </p>
      )}

      <div className="settings-action-row">
        <button onClick={onCheck} disabled={checking || status.state === 'checking'}>
          {checking || status.state === 'checking'
            ? 'Checking…'
            : 'Check for updates'}
        </button>
      </div>

      {status.state === 'not-available' && (
        <p className="editor-hint">
          You're up to date — v{currentVersion} is the latest release.
        </p>
      )}

      {(status.state === 'available' ||
        status.state === 'downloading' ||
        status.state === 'downloaded') && (
        <UpdateDetails
          status={status}
          currentVersion={currentVersion}
          onInstall={onInstall}
        />
      )}

      {lastCheckError && (
        <p className="updates-error" role="alert">
          Update check failed: {lastCheckError}
        </p>
      )}

      <p className="editor-hint">
        Updates install in place over the existing app bundle. Your profiles,
        module instances, and saved logins are preserved — you won't need to
        sign in again.
      </p>
    </div>
  );
}

interface DetailsProps {
  status: Extract<
    UpdateStatus,
    { state: 'available' } | { state: 'downloading' } | { state: 'downloaded' }
  >;
  currentVersion: string;
  onInstall: () => void;
}

function UpdateDetails({ status, currentVersion, onInstall }: DetailsProps) {
  if (status.state === 'downloading') {
    return (
      <div className="updates-found">
        <div className="updates-found-title">Downloading update…</div>
        <div className="updates-progress">
          <div
            className="updates-progress-bar"
            style={{ width: `${Math.max(0, Math.min(100, status.percent))}%` }}
          />
        </div>
        <div className="updates-progress-label">{status.percent}%</div>
      </div>
    );
  }

  // available or downloaded — both carry UpdateInfo.
  const name = status.releaseName?.trim() || `Nexus v${status.version}`;
  const notes = status.releaseNotes?.trim() ?? '';
  const date = status.releaseDate ? formatDate(status.releaseDate) : null;

  return (
    <div className="updates-found">
      <div className="updates-found-header">
        <div>
          <div className="updates-found-title">{name}</div>
          <div className="updates-found-meta">
            v{status.version}
            {date ? ` · released ${date}` : ''}
            {` · you have v${currentVersion}`}
          </div>
        </div>
        {status.state === 'downloaded' ? (
          <button className="confirm-ok" onClick={onInstall}>
            Install and restart
          </button>
        ) : (
          <span className="updates-pill">Downloading…</span>
        )}
      </div>

      {notes ? (
        <>
          <div className="updates-changelog-label">Release notes</div>
          <pre className="updates-changelog">{notes}</pre>
        </>
      ) : (
        <p className="editor-hint">No release notes were published for this version.</p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
