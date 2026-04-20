import React, { useEffect, useState } from 'react';
import type { UpdateStatus } from '../nexus';
import { Markdown } from './Markdown';

type AppInfo = { version: string; isPackaged: boolean };

/**
 * Settings → Updates. Manual check / download / install UI backed by the
 * main-process UpdaterService (electron-updater, pointed at the GitHub
 * release feed in package.json).
 *
 * Flow:
 *   idle / not-available  →  click "Check for updates"
 *   available             →  shows release notes + "Download update" button
 *   downloading           →  progress bar + %
 *   downloaded            →  "Install and restart" button
 *
 * auto-download is disabled in UpdaterService — every step is a manual user
 * action, so bandwidth and storage are under their control.
 *
 * In dev (app.isPackaged === false) the updater is intentionally disabled
 * because the latest-*.yml manifests only exist for tagged GitHub releases.
 */
export function UpdatesTab() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [checking, setChecking] = useState(false);
  const [downloadRequested, setDownloadRequested] = useState(false);
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
      if (s.state !== 'checking') setChecking(false);
      if (s.state === 'downloading' || s.state === 'downloaded') {
        setDownloadRequested(false);
      }
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
      setStatus(result);
      if (result.state !== 'checking') setChecking(false);
      if (result.state === 'error') setLastCheckError(result.message);
    } catch (err) {
      setChecking(false);
      setLastCheckError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDownload = async () => {
    setLastCheckError(null);
    setDownloadRequested(true);
    try {
      const result = await window.nexus.downloadUpdate();
      setStatus(result);
      if (result.state === 'error') setLastCheckError(result.message);
    } catch (err) {
      setDownloadRequested(false);
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
          Updates are disabled in development builds — packaged releases only.
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
          downloadRequested={downloadRequested}
          onDownload={onDownload}
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
  downloadRequested: boolean;
  onDownload: () => void;
  onInstall: () => void;
}

function UpdateDetails({
  status,
  currentVersion,
  downloadRequested,
  onDownload,
  onInstall,
}: DetailsProps) {
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
          <button
            className="confirm-ok"
            onClick={onDownload}
            disabled={downloadRequested}
          >
            {downloadRequested ? 'Starting download…' : 'Download update'}
          </button>
        )}
      </div>

      {notes ? (
        <div className="updates-changelog">
          <div className="updates-changelog-label">Release notes</div>
          <Markdown source={notes} />
        </div>
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
