import React, { useEffect, useMemo } from 'react';
import { useNexus } from './store';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppHeader } from './components/AppHeader';
import { ConfirmDialog } from './components/ConfirmDialog';
import { AddInstanceDialog } from './components/AddInstanceDialog';
import { AccountManager } from './components/AccountManager';
import { CommandPalette } from './components/CommandPalette';
import { UpdateBanner } from './components/UpdateBanner';
import { applyTheme } from './theme';
import { useShortcuts } from './hooks/useShortcuts';

export function App() {
  const init = useNexus((s) => s.init);
  const ready = useNexus((s) => s.ready);
  const error = useNexus((s) => s.error);
  const themes = useNexus((s) => s.themes);
  const themeId = useNexus((s) => s.state.themeId);
  const previewTheme = useNexus((s) => s.previewTheme);
  const activeInstanceId = useNexus((s) => s.state.activeInstanceId);
  const layout = useNexus((s) => s.state.sidebarLayout);
  const activateInstance = useNexus((s) => s.activateInstance);
  const reloadActiveInstance = useNexus((s) => s.reloadActiveInstance);
  const settingsOpen = useNexus((s) => s.settingsOpen);
  const openSettings = useNexus((s) => s.openSettings);
  const closeSettings = useNexus((s) => s.closeSettings);
  const toggleSettings = useNexus((s) => s.toggleSettings);
  const toggleCommandPalette = useNexus((s) => s.toggleCommandPalette);
  const overlayCount = useNexus((s) => s.overlayCount);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.platform = window.nexus.platform;
  }, []);

  // Native app menu dispatches. The main-process MenuService fires these via
  // nexus:menu IPC so items like "Settings…" and "New Instance…" in the
  // macOS menu bar route through the same store actions as the in-app UI.
  useEffect(() => {
    const unsubscribe = window.nexus.onMenu((event) => {
      if (event === 'open-settings') {
        useNexus.getState().openSettings();
      } else if (event === 'add-instance') {
        useNexus.getState().openAddInstance();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const theme = previewTheme ?? themes.find((t) => t.id === themeId) ?? themes[0];
    if (theme) applyTheme(theme);
  }, [themes, themeId, previewTheme]);

  // Central rule: whenever any Nexus overlay is active (Settings, Confirm,
  // AddInstance, any future dialog using useOverlay), collapse the active
  // WebContentsView to zero bounds so the React UI renders above it. This is
  // THE mechanism that keeps Nexus chrome visible — every modal opts in via
  // the useOverlay hook; there is no other source of suspension.
  useEffect(() => {
    window.nexus.setViewsSuspended(overlayCount > 0).catch(() => {});
  }, [overlayCount]);

  const flattenedInstanceIds = useMemo(() => {
    if (!layout) return [] as string[];
    const out: string[] = [];
    for (const g of layout.groups) {
      if (g.collapsed) continue;
      for (const id of g.entryIds) out.push(id);
    }
    return out;
  }, [layout]);

  useShortcuts([
    {
      mod: true,
      key: ',',
      run: () => toggleSettings(),
      description: 'Toggle settings',
    },
    {
      mod: true,
      key: 'k',
      run: () => toggleCommandPalette(),
      description: 'Open command palette',
    },
    {
      mod: true,
      key: 'r',
      run: () => reloadActiveInstance(),
      description: 'Reload active instance',
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      mod: true,
      key: String(i + 1),
      run: () => {
        const target = flattenedInstanceIds[i];
        if (target) activateInstance(target);
      },
      description: `Activate instance ${i + 1}`,
    })),
  ]);

  if (!ready) {
    return <div className="loading">Loading Nexus…</div>;
  }

  if (error) {
    return (
      <div className="error-boundary">
        <div className="error-panel">
          <h2>Nexus failed to initialize</h2>
          <pre>{error}</pre>
          <button onClick={() => init()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <AppHeader onOpenSettings={openSettings} />
        <UpdateBanner />
        <div className="app-body">
          <Sidebar />
          <ContentArea hasActive={!!activeInstanceId} />
        </div>
        {settingsOpen && <SettingsPanel onClose={closeSettings} />}
        <AddInstanceDialog />
        <AccountManager />
        <CommandPalette />
        <ConfirmDialog />
      </div>
    </ErrorBoundary>
  );
}
