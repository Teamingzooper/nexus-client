import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';
import { ThemeEditor } from './ThemeEditor';

interface Props {
  onClose: () => void;
}

type Tab = 'modules' | 'notifications' | 'themes' | 'general';

export function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('modules');

  const modules = useNexus((s) => s.modules);
  const instances = useNexus((s) => s.state.instances);
  const notificationsEnabled = useNexus((s) => s.state.notificationsEnabled ?? true);
  const notificationSound = useNexus((s) => s.state.notificationSound ?? true);
  const launchAtLogin = useNexus((s) => s.state.launchAtLogin ?? false);
  const sidebarCompact = useNexus((s) => s.state.sidebarCompact ?? false);

  const setNotificationsEnabled = useNexus((s) => s.setNotificationsEnabled);
  const setNotificationSound = useNexus((s) => s.setNotificationSound);
  const setLaunchAtLogin = useNexus((s) => s.setLaunchAtLogin);
  const setSidebarCompact = useNexus((s) => s.setSidebarCompact);

  const testNotification = useNexus((s) => s.testNotification);
  const addInstance = useNexus((s) => s.addInstance);
  const removeInstance = useNexus((s) => s.removeInstance);
  const reload = useNexus((s) => s.reloadModules);
  const showConfirm = useNexus((s) => s.showConfirm);
  const clearAllData = useNexus((s) => s.clearAllData);

  const [notifFlash, setNotifFlash] = useState<string | null>(null);

  useOverlay();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirmRemove = async (instance: { id: string; name: string }) => {
    const ok = await showConfirm({
      title: `Delete ${instance.name}?`,
      message:
        'All session data for this instance (cookies, login state, local storage) will be permanently erased. This cannot be undone.',
      confirmLabel: 'Delete and wipe data',
      danger: true,
    });
    if (ok) removeInstance(instance.id).catch((err) => console.error('remove failed', err));
  };

  const confirmClearAll = async () => {
    const ok = await showConfirm({
      title: 'Clear all Nexus data?',
      message:
        'This will delete every instance (and all its session data), every custom theme, your sidebar layout, and any saved preferences. The app will reload with factory defaults. This cannot be undone.',
      confirmLabel: 'Clear everything',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearAllData();
    } catch (err) {
      console.error('clearAllData failed', err);
    }
  };

  const runTestNotification = async () => {
    const ok = await testNotification();
    setNotifFlash(
      ok
        ? 'Test notification sent — check your notification center.'
        : 'Could not show a test notification. Your OS may be blocking them.',
    );
    setTimeout(() => setNotifFlash(null), 4000);
  };

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
              aria-selected={tab === 'notifications'}
              className={tab === 'notifications' ? 'tab active' : 'tab'}
              onClick={() => setTab('notifications')}
            >
              Notifications
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
              aria-selected={tab === 'general'}
              className={tab === 'general' ? 'tab active' : 'tab'}
              onClick={() => setTab('general')}
            >
              General
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

              <p className="editor-hint">
                A <strong>module</strong> is the template for a messaging service. Add multiple{' '}
                <strong>instances</strong> of any module to log in with separate accounts —
                e.g. two WhatsApps, one work, one personal.
              </p>

              <ul className="module-settings" role="list">
                {modules.map((m) => {
                  const myInstances = instances.filter((i) => i.moduleId === m.manifest.id);
                  return (
                    <li key={m.manifest.id} className="module-card">
                      <div className="module-info">
                        {m.iconDataUrl ? (
                          <img src={m.iconDataUrl} alt="" />
                        ) : (
                          <div className="icon-placeholder">
                            {m.manifest.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="module-info-text">
                          <div className="module-name">{m.manifest.name}</div>
                          <div className="module-meta">
                            v{m.manifest.version}
                            {m.manifest.author ? ` · ${m.manifest.author}` : ''}
                          </div>
                          {m.manifest.description && (
                            <div className="module-desc">{m.manifest.description}</div>
                          )}
                          {myInstances.length > 0 && (
                            <div className="instance-tags">
                              {myInstances.map((i) => (
                                <span key={i.id} className="instance-tag" title={i.id}>
                                  {i.name}
                                  <button
                                    className="instance-tag-remove"
                                    onClick={() => confirmRemove(i)}
                                    aria-label={`Remove ${i.name}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        className="toggle on"
                        onClick={() => addInstance(m.manifest.id)}
                        title={`Add another instance of ${m.manifest.name}`}
                      >
                        + Add
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

          {tab === 'notifications' && (
            <div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(e) => setNotificationsEnabled(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Enable native notifications</div>
                  <div className="settings-toggle-desc">
                    Show native OS notifications when any instance receives a message.
                    Format: <code>[Nexus] &lt;instance name&gt;</code> with the message content
                    as the body. Click a notification to focus that instance.
                  </div>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationSound}
                  disabled={!notificationsEnabled}
                  onChange={(e) => setNotificationSound(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Play notification sound</div>
                  <div className="settings-toggle-desc">
                    Use your OS's default notification sound when a message arrives. Uncheck
                    for silent popups.
                  </div>
                </div>
              </label>

              <div className="settings-action-row">
                <button onClick={runTestNotification}>Send test notification</button>
                {notifFlash && <span className="toggle-flash">{notifFlash}</span>}
              </div>

              <p className="editor-hint">
                Nexus intercepts <code>window.Notification</code> and service-worker
                notifications in every embedded service and re-displays them natively with
                the branded title. Counts shown next to each sidebar instance come from the
                service's own title/badge signals, not from Nexus scraping.
              </p>
            </div>
          )}

          {tab === 'themes' && <ThemeEditor />}

          {tab === 'general' && (
            <div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={launchAtLogin}
                  onChange={(e) => setLaunchAtLogin(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Launch at login</div>
                  <div className="settings-toggle-desc">
                    Open Nexus automatically when you sign in. Only takes effect in the
                    packaged app — dev builds ignore this setting.
                  </div>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={sidebarCompact}
                  onChange={(e) => setSidebarCompact(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Compact sidebar</div>
                  <div className="settings-toggle-desc">
                    Shrink the sidebar to icons-only. Saves horizontal space for the active
                    instance view.
                  </div>
                </div>
              </label>

              <div className="about">
                <h3>Keyboard shortcuts</h3>
                <dl className="shortcuts">
                  <dt><kbd>⌘,</kbd></dt>
                  <dd>Toggle settings</dd>
                  <dt><kbd>⌘R</kbd></dt>
                  <dd>Reload active instance</dd>
                  <dt><kbd>⌘N</kbd></dt>
                  <dd>New instance…</dd>
                  <dt><kbd>⌘⇧N</kbd></dt>
                  <dd>New group</dd>
                  <dt><kbd>⌘1</kbd>–<kbd>⌘9</kbd></dt>
                  <dd>Jump to sidebar instance</dd>
                  <dt><kbd>F2</kbd></dt>
                  <dd>Rename selected sidebar item</dd>
                  <dt><kbd>Esc</kbd></dt>
                  <dd>Close settings</dd>
                </dl>
              </div>

              <div className="danger-zone">
                <h3>Danger zone</h3>
                <p>
                  Wipe every instance (and all of their session data), every custom theme,
                  your sidebar layout, and any saved preferences. The app will reload with
                  factory defaults.
                </p>
                <button className="danger-button" onClick={confirmClearAll}>
                  Clear all data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
