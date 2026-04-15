import React, { useEffect, useRef, useState } from 'react';
import { useNexus } from './store';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { SettingsPanel } from './components/SettingsPanel';
import { applyTheme } from './theme';

export function App() {
  const init = useNexus((s) => s.init);
  const ready = useNexus((s) => s.ready);
  const themes = useNexus((s) => s.themes);
  const themeId = useNexus((s) => s.state.themeId);
  const activeModuleId = useNexus((s) => s.state.activeModuleId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    init().catch((err) => console.error('init failed:', err));
  }, [init]);

  useEffect(() => {
    const theme = themes.find((t) => t.id === themeId) ?? themes[0];
    if (theme) applyTheme(theme);
  }, [themes, themeId]);

  if (!ready) {
    return <div className="loading">Loading Nexus…</div>;
  }

  return (
    <div className="app">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <ContentArea hasActive={!!activeModuleId} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
