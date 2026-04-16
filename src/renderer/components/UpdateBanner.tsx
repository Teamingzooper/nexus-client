import React, { useEffect, useState } from 'react';
import type { UpdateStatus } from '../nexus';

/**
 * Slim banner that appears at the top of the window when an update has
 * finished downloading. The user clicks "Restart to install" and we call
 * the updater IPC channel to quitAndInstall.
 *
 * In dev / unsupported platforms the updater is disabled and this
 * component never shows anything.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.nexus
      .getUpdaterStatus()
      .then((s) => {
        if (mounted) setStatus(s as UpdateStatus);
      })
      .catch(() => {});
    const off = window.nexus.onUpdaterStatus((s) => {
      if (mounted) {
        setStatus(s as UpdateStatus);
        setDismissed(false);
      }
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  if (dismissed) return null;
  if (status.state !== 'downloaded' && status.state !== 'available') return null;

  // While downloading, electron-updater is fetching automatically.
  // Show the prompt only once the bytes are on disk.
  if (status.state === 'available') return null;

  return (
    <div className="update-banner" role="status">
      <span>
        Nexus <strong>{(status as any).version}</strong> is ready to install.
      </span>
      <div className="update-banner-actions">
        <button
          className="confirm-ok"
          onClick={() => window.nexus.installUpdate().catch(() => {})}
        >
          Restart to install
        </button>
        <button onClick={() => setDismissed(true)}>Later</button>
      </div>
    </div>
  );
}
