import React, { useEffect, useState } from 'react';
import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';
import { ThemeEditor } from './ThemeEditor';
import { UpdatesTab } from './UpdatesTab';
import { CommunityModulesBrowser } from './CommunityModulesBrowser';
import { EmailSettingsTab } from './EmailSettingsTab';
import { HotkeysSettingsTab } from './HotkeysSettingsTab';

interface Props {
  onClose: () => void;
}

type Tab = 'modules' | 'notifications' | 'themes' | 'general' | 'email' | 'hotkeys' | 'updates';

export function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('modules');

  const modules = useNexus((s) => s.modules);
  const instances = useNexus((s) => s.state.instances);
  const notificationsEnabled = useNexus((s) => s.state.notificationsEnabled ?? true);
  const notificationSound = useNexus((s) => s.state.notificationSound ?? true);
  const notificationPrivacyMode = useNexus((s) => s.state.notificationPrivacyMode ?? false);
  const dndEnabled = useNexus((s) => s.state.dndEnabled ?? false);
  const dndStart = useNexus((s) => s.state.dndStart ?? '22:00');
  const dndEnd = useNexus((s) => s.state.dndEnd ?? '08:00');
  const launchAtLogin = useNexus((s) => s.state.launchAtLogin ?? false);
  const closeToTray = useNexus((s) => s.state.closeToTray ?? false);
  const globalShortcutEnabled = useNexus((s) => s.state.globalShortcutEnabled ?? false);
  const globalShortcut = useNexus((s) => s.state.globalShortcut ?? 'Alt+`');

  const setNotificationsEnabled = useNexus((s) => s.setNotificationsEnabled);
  const setNotificationSound = useNexus((s) => s.setNotificationSound);
  const setNotificationPrivacyMode = useNexus((s) => s.setNotificationPrivacyMode);
  const setDnd = useNexus((s) => s.setDnd);
  const setLaunchAtLogin = useNexus((s) => s.setLaunchAtLogin);
  const setCloseToTray = useNexus((s) => s.setCloseToTray);
  const setGlobalShortcutEnabled = useNexus((s) => s.setGlobalShortcutEnabled);
  const setGlobalShortcut = useNexus((s) => s.setGlobalShortcut);

  const [shortcutDraft, setShortcutDraft] = useState(globalShortcut);
  useEffect(() => {
    setShortcutDraft(globalShortcut);
  }, [globalShortcut]);

  const testNotification = useNexus((s) => s.testNotification);
  const addInstance = useNexus((s) => s.addInstance);
  const removeInstance = useNexus((s) => s.removeInstance);
  const reload = useNexus((s) => s.reloadModules);
  const showConfirm = useNexus((s) => s.showConfirm);
  const clearAllData = useNexus((s) => s.clearAllData);

  const [notifFlash, setNotifFlash] = useState<string | null>(null);
  const [communityOpen, setCommunityOpen] = useState(false);

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
            <button
              role="tab"
              aria-selected={tab === 'email'}
              className={tab === 'email' ? 'tab active' : 'tab'}
              onClick={() => setTab('email')}
            >
              Email
            </button>
            <button
              role="tab"
              aria-selected={tab === 'hotkeys'}
              className={tab === 'hotkeys' ? 'tab active' : 'tab'}
              onClick={() => setTab('hotkeys')}
            >
              Hotkeys
            </button>
            <button
              role="tab"
              aria-selected={tab === 'updates'}
              className={tab === 'updates' ? 'tab active' : 'tab'}
              onClick={() => setTab('updates')}
            >
              Updates
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
                <button onClick={() => setCommunityOpen(true)}>
                  Browse community modules
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

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationPrivacyMode}
                  disabled={!notificationsEnabled}
                  onChange={(e) => setNotificationPrivacyMode(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Privacy mode</div>
                  <div className="settings-toggle-desc">
                    Replace message bodies with "New message" so screen-shares and
                    shoulder-surfers don't see content. The instance name still appears
                    in the title.
                  </div>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={dndEnabled}
                  disabled={!notificationsEnabled}
                  onChange={(e) => setDnd(e.target.checked, dndStart, dndEnd)}
                />
                <div>
                  <div className="settings-toggle-title">Do Not Disturb hours</div>
                  <div className="settings-toggle-desc">
                    Suppress popups during a recurring time window. Sidebar badges still
                    update; only the native notification is silenced.
                  </div>
                  <div className="settings-toggle-actions">
                    <label className="dnd-time">
                      From{' '}
                      <input
                        type="time"
                        value={dndStart}
                        disabled={!dndEnabled || !notificationsEnabled}
                        onChange={(e) => setDnd(dndEnabled, e.target.value, dndEnd)}
                      />
                    </label>
                    <label className="dnd-time">
                      Until{' '}
                      <input
                        type="time"
                        value={dndEnd}
                        disabled={!dndEnabled || !notificationsEnabled}
                        onChange={(e) => setDnd(dndEnabled, dndStart, e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </label>

              <div className="settings-action-row">
                <button onClick={runTestNotification}>Send test notification</button>
                {notifFlash && <span className="toggle-flash">{notifFlash}</span>}
              </div>

              <p className="editor-hint">
                Nexus intercepts <code>window.Notification</code> and service-worker
                notifications in every embedded service and re-displays them natively.
                Counts shown next to each sidebar instance come from the service's own
                title/badge signals. Right-click an instance in the sidebar (or use the
                bell icon on hover) to mute it individually.
              </p>
            </div>
          )}

          {tab === 'themes' && <ThemeEditor />}

          {tab === 'email' && <EmailSettingsTab />}

          {tab === 'hotkeys' && <HotkeysSettingsTab />}

          {tab === 'updates' && <UpdatesTab />}

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
                    Open Nexus automatically when you sign in.
                  </div>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={closeToTray}
                  onChange={(e) => setCloseToTray(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Close to system tray</div>
                  <div className="settings-toggle-desc">
                    When you close the Nexus window, keep the app running in the
                    system tray (menu bar on macOS) so notifications keep arriving.
                    Quit from the tray menu or <kbd>⌘Q</kbd>/<kbd>Ctrl+Q</kbd>.
                  </div>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={globalShortcutEnabled}
                  onChange={(e) => setGlobalShortcutEnabled(e.target.checked)}
                />
                <div>
                  <div className="settings-toggle-title">Global show/hide shortcut</div>
                  <div className="settings-toggle-desc">
                    Summon or hide Nexus from anywhere with a system-wide keyboard
                    shortcut. Use Electron accelerator syntax (e.g. <code>Alt+`</code>,{' '}
                    <code>CommandOrControl+Shift+N</code>).
                  </div>
                  <div className="settings-toggle-actions">
                    <input
                      type="text"
                      className="shortcut-input"
                      value={shortcutDraft}
                      disabled={!globalShortcutEnabled}
                      onChange={(e) => setShortcutDraft(e.target.value)}
                      onBlur={() => {
                        if (shortcutDraft.trim() && shortcutDraft !== globalShortcut) {
                          setGlobalShortcut(shortcutDraft).catch(() => {
                            setShortcutDraft(globalShortcut);
                          });
                        } else {
                          setShortcutDraft(globalShortcut);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') {
                          setShortcutDraft(globalShortcut);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
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

      {communityOpen && (
        <CommunityModulesBrowser onClose={() => setCommunityOpen(false)} />
      )}
    </div>
  );
}
