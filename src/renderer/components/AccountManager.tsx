import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';
import type { ProfileSummary } from '../../shared/types';

type Mode = { kind: 'pick' } | { kind: 'unlock'; profile: ProfileSummary } | { kind: 'create' };

export function AccountManager() {
  const open = useNexus((s) => s.accountManagerOpen);
  const profiles = useNexus((s) => s.profiles);
  const currentProfile = useNexus((s) => s.currentProfile);
  const unlock = useNexus((s) => s.unlockCurrentProfile);
  const createProfile = useNexus((s) => s.createProfile);
  const deleteProfile = useNexus((s) => s.deleteProfile);
  const close = useNexus((s) => s.closeAccountManager);
  const showConfirm = useNexus((s) => s.showConfirm);

  const [mode, setMode] = useState<Mode>({ kind: 'pick' });
  const [password, setPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useOverlay(open);

  useEffect(() => {
    if (!open) {
      setMode({ kind: 'pick' });
      setPassword('');
      setNewName('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentProfile) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, currentProfile, close]);

  if (!open) return null;

  const tryUnlock = async (profile: ProfileSummary, withPassword?: string) => {
    setBusy(true);
    setError(null);
    try {
      await unlock(profile.id, withPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onPickProfile = async (profile: ProfileSummary) => {
    if (profile.hasPassword) {
      setMode({ kind: 'unlock', profile });
      setPassword('');
      setError(null);
    } else {
      await tryUnlock(profile);
    }
  };

  const onSubmitUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'unlock') return;
    await tryUnlock(mode.profile, password);
  };

  const onSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    if (newPassword && newPassword !== newPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createProfile(name, newPassword || undefined);
      // If password-less, unlock immediately and close.
      if (!newPassword) {
        await tryUnlock(created);
      } else {
        setMode({ kind: 'pick' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (profile: ProfileSummary) => {
    const ok = await showConfirm({
      title: `Delete profile "${profile.name}"?`,
      message:
        'This removes the profile and all of its instances from the sidebar. ' +
        'Session data (cookies, logins) for its instances is also wiped. ' +
        'This cannot be undone.',
      confirmLabel: 'Delete profile',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProfile(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop account-manager-backdrop" role="dialog" aria-modal="true">
      <div className="modal account-manager" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            {mode.kind === 'create'
              ? 'New profile'
              : mode.kind === 'unlock'
                ? `Unlock ${mode.profile.name}`
                : 'Who\u2019s using Nexus?'}
          </h2>
          {currentProfile && mode.kind === 'pick' && (
            <button className="close" onClick={close} aria-label="Close">
              ×
            </button>
          )}
        </header>

        <div className="modal-body">
          {mode.kind === 'pick' && (
            <>
              <ul className="profile-grid" role="list">
                {profiles.map((p) => (
                  <li key={p.id} className="profile-card">
                    <button
                      className="profile-card-button"
                      onClick={() => onPickProfile(p)}
                      disabled={busy}
                    >
                      <div className="profile-avatar" aria-hidden="true">
                        {p.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="profile-card-name">
                        {p.name}
                        {p.hasPassword && (
                          <span className="profile-lock" title="Password protected" aria-label="locked">
                            🔒
                          </span>
                        )}
                      </div>
                    </button>
                    {profiles.length > 1 && (
                      <button
                        className="profile-card-delete"
                        title={`Delete ${p.name}`}
                        aria-label={`Delete ${p.name}`}
                        onClick={() => onDelete(p)}
                        disabled={busy}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
                <li className="profile-card">
                  <button
                    className="profile-card-button profile-card-new"
                    onClick={() => {
                      setMode({ kind: 'create' });
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    <div className="profile-avatar profile-avatar-new">+</div>
                    <div className="profile-card-name">New profile</div>
                  </button>
                </li>
              </ul>
              {error && <div className="error-message">{error}</div>}
            </>
          )}

          {mode.kind === 'unlock' && (
            <form onSubmit={onSubmitUnlock} className="profile-form">
              <p className="editor-hint">
                Enter the password for <strong>{mode.profile.name}</strong>.
              </p>
              <label className="theme-field">
                <span>Password</span>
                <input
                  autoFocus
                  type="password"
                  className="theme-name"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
              {error && <div className="error-message">{error}</div>}
              <div className="confirm-actions">
                <button
                  type="button"
                  onClick={() => setMode({ kind: 'pick' })}
                  disabled={busy}
                >
                  ← Back
                </button>
                <button type="submit" className="confirm-ok" disabled={busy || !password}>
                  {busy ? 'Unlocking\u2026' : 'Unlock'}
                </button>
              </div>
            </form>
          )}

          {mode.kind === 'create' && (
            <form onSubmit={onSubmitCreate} className="profile-form">
              <label className="theme-field">
                <span>Name</span>
                <input
                  autoFocus
                  className="theme-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Work, Personal"
                  disabled={busy}
                />
              </label>
              <label className="theme-field">
                <span>Password</span>
                <input
                  type="password"
                  className="theme-name"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="optional"
                  disabled={busy}
                />
              </label>
              {newPassword && (
                <label className="theme-field">
                  <span>Confirm</span>
                  <input
                    type="password"
                    className="theme-name"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
              <p className="editor-hint">
                Leave the password empty for a profile that opens without a prompt.
                Password-protected profiles encrypt their instance list and sidebar
                layout at rest. <strong>Note:</strong> the underlying Chromium session data
                (cookies, logged-in state) is not encrypted — a profile password is a
                UI separation, not protection against someone with disk access to your
                user folder.
              </p>
              {error && <div className="error-message">{error}</div>}
              <div className="confirm-actions">
                <button
                  type="button"
                  onClick={() => setMode({ kind: 'pick' })}
                  disabled={busy}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="confirm-ok"
                  disabled={busy || !newName.trim()}
                >
                  {busy ? 'Creating\u2026' : 'Create profile'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
