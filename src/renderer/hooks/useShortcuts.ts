import { useEffect } from 'react';

export interface ShortcutHandler {
  mod?: boolean; // Cmd on mac, Ctrl elsewhere
  shift?: boolean;
  key: string;
  run: () => void;
  description?: string;
}

export function useShortcuts(handlers: ShortcutHandler[]): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modKey = navigator.platform.toLowerCase().includes('mac') ? e.metaKey : e.ctrlKey;
      for (const h of handlers) {
        if (h.mod && !modKey) continue;
        if (!h.mod && modKey) continue;
        if (h.shift && !e.shiftKey) continue;
        if (!h.shift && e.shiftKey) continue;
        if (e.key.toLowerCase() !== h.key.toLowerCase()) continue;
        e.preventDefault();
        h.run();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
