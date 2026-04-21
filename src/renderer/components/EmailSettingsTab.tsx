import { useState } from 'react';
import { useNexus } from '../store';
import type { EmailPeekConfig, VipEntry } from '../../shared/types';

/**
 * Settings tab for Nexus Mail: VIP CRUD + peek panel configuration.
 * Mounted as a new tab inside SettingsPanel.
 */
export function EmailSettingsTab(): JSX.Element {
  const vips = useNexus((s) => s.emailVips);
  const addVip = useNexus((s) => s.addVip);
  const removeVip = useNexus((s) => s.removeVip);
  const peekConfig = useNexus((s) => s.emailPeekConfig);
  const setPeekConfig = useNexus((s) => s.setEmailPeekConfig);

  const [newEmail, setNewEmail] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newSound, setNewSound] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(): Promise<void> {
    const email = newEmail.trim();
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Not a valid email address');
      return;
    }
    const entry: VipEntry = { email };
    const label = newLabel.trim();
    const sound = newSound.trim();
    if (label) entry.label = label;
    if (sound) entry.sound = sound;
    try {
      await addVip(entry);
      setNewEmail('');
      setNewLabel('');
      setNewSound('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function updatePeek(patch: Partial<EmailPeekConfig>): void {
    void setPeekConfig({ ...peekConfig, ...patch });
  }

  return (
    <div className="settings-tab email-settings">
      <section className="settings-section">
        <h3>VIP senders</h3>
        <p className="settings-hint">
          VIPs get a ⭐ prefix in notifications, a dedicated unread counter in
          the sidebar peek, and an optional custom notification sound.
        </p>
        <table className="vip-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Label</th>
              <th>Sound</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {vips.length === 0 && (
              <tr>
                <td colSpan={4} className="vip-empty">
                  No VIPs yet. Add one below, or right-click a sender in an
                  email view and choose "Mark as VIP".
                </td>
              </tr>
            )}
            {vips.map((v) => (
              <tr key={v.email}>
                <td>{v.email}</td>
                <td>{v.label ?? ''}</td>
                <td>{v.sound ?? ''}</td>
                <td>
                  <button
                    type="button"
                    className="vip-remove"
                    onClick={() => {
                      void removeVip(v.email);
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            <tr className="vip-add-row">
              <td>
                <input
                  type="email"
                  value={newEmail}
                  placeholder="person@example.com"
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={newLabel}
                  placeholder="Label (optional)"
                  maxLength={64}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={newSound}
                  placeholder="Sound (optional)"
                  maxLength={64}
                  onChange={(e) => setNewSound(e.target.value)}
                />
              </td>
              <td>
                <button type="button" onClick={onAdd}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {error && <p className="vip-error">{error}</p>}
      </section>

      <section className="settings-section">
        <h3>Peek panel</h3>
        <p className="settings-hint">
          The peek panel shows the latest mail from every email account in the
          sidebar.
        </p>

        <label className="settings-field">
          Visibility
          <select
            value={peekConfig.visible}
            onChange={(e) =>
              updatePeek({ visible: e.target.value as EmailPeekConfig['visible'] })
            }
          >
            <option value="always">Always visible</option>
            <option value="hover">Show on hover</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>

        <label className="settings-field">
          Items per account
          <input
            type="number"
            min={1}
            max={20}
            value={peekConfig.perAccount}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const clamped = Math.max(1, Math.min(20, Number.isFinite(raw) ? raw : 5));
              updatePeek({ perAccount: clamped });
            }}
          />
        </label>

        <label className="settings-field">
          Grouping
          <select
            value={peekConfig.grouping}
            onChange={(e) =>
              updatePeek({ grouping: e.target.value as EmailPeekConfig['grouping'] })
            }
          >
            <option value="by-account">By account</option>
            <option value="unified">Unified (chronological)</option>
          </select>
        </label>
      </section>
    </div>
  );
}
