# Nexus

A modular, moddable desktop messaging client. Nexus is a thin, themeable shell around the messaging services you already use on the web — WhatsApp, Telegram, Messenger, Signal, and anything else with a web portal.

Sending and receiving happens inside the real web app. Nexus just gives them all one window, one theme, and one notification badge.

## Features

- **Isolated sessions per service** — each module runs in its own Electron `partition:` so cookies and storage never leak between services.
- **Hot-loadable modules** — drop a folder in `~/Library/Application Support/Nexus/modules/` and reload.
- **CSS + preload injection** — tweak visuals and scrape unread counts from inside each embedded view.
- **Unified notifications** — counts roll up into a dock/taskbar badge and sidebar badges.
- **Live theme editor** — edit the entire color palette with color pickers, save, and apply instantly.

## Quickstart

```bash
npm install
npm run dev          # starts Vite + tsc watchers
npm start            # in another terminal, launches Electron
# or one-shot:
npm run launch
```

First run: open Settings → Modules, enable WhatsApp (or any bundled module), then click it in the sidebar.

## Project Layout

```
src/
├── main/            Electron main-process code
│   ├── index.ts            app bootstrap, window creation
│   ├── moduleRegistry.ts   scans + validates module manifests
│   ├── viewManager.ts      WebContentsView per module
│   ├── settingsStore.ts    persisted app state
│   ├── themeStore.ts       built-in + user themes
│   ├── notificationHub.ts  unread aggregation, badge
│   ├── ipc.ts              ipcMain handlers
│   └── preload.ts          contextBridge → window.nexus
├── renderer/        React UI (Vite)
│   ├── App.tsx
│   ├── store.ts     zustand store
│   └── components/
└── shared/
    └── types.ts     shared types + IPC channel names
modules/             bundled messaging modules
docs/                module authoring guide
```

## Documentation

- [Writing a Nexus module](docs/MODULES.md)
- [Theme format](docs/THEMES.md)

## License

MIT
