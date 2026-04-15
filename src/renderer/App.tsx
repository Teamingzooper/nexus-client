import React, { useEffect, useMemo } from 'react';
import { useNexus } from './store';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppHeader } from './components/AppHeader';
import { ConfirmDialog } from './components/ConfirmDialog';
import { AddInstanceDialog } from './components/AddInstanceDialog';
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

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const theme = previewTheme ?? themes.find((t) => t.id === themeId) ?? themes[0];
    if (theme) applyTheme(theme);
  }, [themes, themeId, previewTheme]);

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
        <div className="app-body">
          <Sidebar />
          <ContentArea hasActive={!!activeInstanceId} />
        </div>
        {settingsOpen && <SettingsPanel onClose={closeSettings} />}
        <AddInstanceDialog />
        <ConfirmDialog />
      </div>
    </ErrorBoundary>
  );
}
