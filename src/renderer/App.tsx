import React, { useEffect, useMemo, useState } from 'react';
import { useNexus } from './store';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyTheme } from './theme';
import { useShortcuts } from './hooks/useShortcuts';

export function App() {
  const init = useNexus((s) => s.init);
  const ready = useNexus((s) => s.ready);
  const error = useNexus((s) => s.error);
  const themes = useNexus((s) => s.themes);
  const themeId = useNexus((s) => s.state.themeId);
  const activeModuleId = useNexus((s) => s.state.activeModuleId);
  const modules = useNexus((s) => s.modules);
  const enabledIds = useNexus((s) => s.state.enabledModuleIds);
  const activate = useNexus((s) => s.activate);
  const reloadActive = useNexus((s) => s.reloadActive);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const theme = themes.find((t) => t.id === themeId) ?? themes[0];
    if (theme) applyTheme(theme);
  }, [themes, themeId]);

  const enabled = useMemo(
    () => modules.filter((m) => enabledIds.includes(m.manifest.id)),
    [modules, enabledIds],
  );

  useShortcuts([
    {
      mod: true,
      key: ',',
      run: () => setSettingsOpen((v) => !v),
      description: 'Toggle settings',
    },
    {
      mod: true,
      key: 'r',
      run: () => reloadActive(),
      description: 'Reload active module',
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      mod: true,
      key: String(i + 1),
      run: () => {
        const target = enabled[i];
        if (target) activate(target.manifest.id);
      },
      description: `Activate module ${i + 1}`,
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
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        <ContentArea hasActive={!!activeModuleId} />
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
    </ErrorBoundary>
  );
}
