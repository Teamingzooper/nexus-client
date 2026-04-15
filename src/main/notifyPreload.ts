// Nexus notification preload.
//
// Loaded into every service view via session.setPreloads(), alongside any
// module-specific preload. Runs in the isolated world with contextIsolation,
// so it cannot directly touch window.Notification in the page's main world.
//
// The main world's shim (injected via webContents.executeJavaScript at
// dom-ready) dispatches a CustomEvent('nexus-notify') on `document`. DOM
// events cross the isolated-world boundary because the DOM itself is
// shared, so this preload hears them and forwards payload to the main
// process via ipcRenderer.send.
//
// Channel contract (see src/shared/types.ts IPC.NOTIFY_SHOW):
//   { title: string, body: string, tag?: string, icon?: string }

import { ipcRenderer } from 'electron';

function coerceString(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

document.addEventListener('nexus-notify', (event: Event) => {
  const detail = (event as CustomEvent).detail;
  if (!detail || typeof detail !== 'object') return;
  const d = detail as Record<string, unknown>;
  const payload = {
    title: coerceString(d.title, 256),
    body: coerceString(d.body, 1024),
    tag: coerceString(d.tag, 128),
    icon: coerceString(d.icon, 2048),
  };
  if (!payload.title && !payload.body) return;
  ipcRenderer.send('nexus:notify:show', payload);
});
