import { useState, type KeyboardEvent } from 'react';
import { useNexus } from '../store';

/**
 * Settings tab for rebindable in-app hotkeys. Lists every action registered
 * with HotkeyRegistryService on the main side, lets the user click to
 * capture a new chord, and surfaces conflict info cleanly.
 */
export function HotkeysSettingsTab(): JSX.Element {
  const hotkeys = useNexus((s) => s.hotkeys);
  const rebind = useNexus((s) => s.rebindHotkey);
  const resetHotkey = useNexus((s) => s.resetHotkey);

  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onCaptureKey(e: KeyboardEvent, actionId: string): Promise<void> {
    if (e.key === 'Escape') {
      setCapturingId(null);
      setMessage(null);
      return;
    }
    const chord = chordFromEvent(e);
    if (!chord) return;
    e.preventDefault();
    try {
      const res = await rebind(actionId, chord);
      if (res.ok) {
        setCapturingId(null);
        setMessage(`Bound to ${chord}`);
      } else {
        setMessage(
          `Chord conflicts with "${res.conflictingActionId}". Rebind that action first or pick a different chord.`,
        );
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function onUnbind(actionId: string): Promise<void> {
    try {
      await rebind(actionId, null);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function onReset(actionId: string): Promise<void> {
    try {
      await resetHotkey(actionId);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="settings-tab hotkeys-settings">
      <section className="settings-section">
        <h3>Hotkeys</h3>
        <p className="settings-hint">
          In-app hotkeys fire while a Nexus window is focused. Click a binding
          to record a new chord, or press Escape to cancel.
        </p>
        {message && <p className="hotkeys-status">{message}</p>}
        <table className="hotkey-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Binding</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {hotkeys.length === 0 && (
              <tr>
                <td colSpan={3} className="hotkey-empty">
                  No rebindable actions registered.
                </td>
              </tr>
            )}
            {hotkeys.map((h) => (
              <tr key={h.id}>
                <td>
                  <div className="hotkey-label">{h.label}</div>
                  {h.description && <div className="settings-hint">{h.description}</div>}
                </td>
                <td>
                  {capturingId === h.id ? (
                    <input
                      className="hotkey-capture"
                      autoFocus
                      readOnly
                      placeholder="Press a chord…"
                      value=""
                      onKeyDown={(e) => {
                        void onCaptureKey(e, h.id);
                      }}
                      onBlur={() => setCapturingId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="hotkey-binding"
                      onClick={() => {
                        setCapturingId(h.id);
                        setMessage(null);
                      }}
                    >
                      {h.currentBinding ?? <span className="hotkey-unbound">(unbound)</span>}
                    </button>
                  )}
                </td>
                <td className="hotkey-actions">
                  <button
                    type="button"
                    onClick={() => {
                      void onUnbind(h.id);
                    }}
                    disabled={h.currentBinding === null}
                  >
                    Unbind
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onReset(h.id);
                    }}
                  >
                    Reset
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/**
 * Convert a React KeyboardEvent into the Electron-Accelerator-style chord
 * string that HotkeyRegistryService expects (e.g. "Cmd+Shift+C").
 * Returns null for modifier-only presses and for bare printable keys
 * without modifiers (those aren't useful as hotkeys).
 */
function chordFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key;
  const normalized = key.length === 1 ? key.toUpperCase() : key;
  parts.push(normalized);
  if (parts.length < 2) return null;
  return parts.join('+');
}
