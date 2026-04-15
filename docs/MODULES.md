# Writing a Nexus Module

A Nexus module is just a folder with a manifest. The simplest valid module is 12 lines of JSON and an icon.

## Where modules live

- **Bundled:** `modules/` in the repo (shipped with Nexus).
- **User:** `~/Library/Application Support/Nexus/modules/` on macOS (or the platform equivalent under `userData`). Open it from Settings → Modules → "Open modules folder".

Nexus loads both directories on startup. User modules override bundled ones if the IDs collide.

## Minimal module

```
modules/my-chat/
├── nexus-module.json
└── icon.svg
```

**`nexus-module.json`**
```json
{
  "id": "my-chat",
  "name": "My Chat",
  "version": "1.0.0",
  "url": "https://chat.example.com",
  "icon": "icon.svg"
}
```

That's it. Drop it in the user modules folder, click "Reload modules" in Settings, and enable it.

## Manifest reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Unique, `^[a-z0-9][a-z0-9-_]*$`. Becomes the session partition. |
| `name` | string | ✅ | Display name. |
| `version` | string | ✅ | Semver. |
| `url` | string | ✅ | The web portal to embed. |
| `icon` | string |  | Relative path to an SVG/PNG file. |
| `author` | string |  | Displayed in Settings. |
| `description` | string |  | Displayed in Settings. |
| `partition` | string |  | Defaults to `persist:<id>`. Override to share sessions between modules (rarely needed). |
| `userAgent` | string |  | Override the UA. Useful when a site rejects Electron's default UA. |
| `inject.css` | string |  | Relative path to a CSS file injected after `dom-ready`. |
| `inject.preload` | string |  | Relative path to a preload JS file. Runs in the embedded view's isolated world. |
| `notifications` | object |  | See below. |

## Notifications

Three strategies — pick the simplest one that works for the target site.

### `title` — parse the page title

```json
"notifications": { "kind": "title", "pattern": "\\((\\d+)\\)" }
```

Works for services that put unread counts in `document.title`, like `(3) Telegram`. The pattern is a JS regex; the first capture group is the count.

### `dom` — query the DOM for a badge

```json
"notifications": { "kind": "dom", "selector": "span.badge-unread", "parse": "int" }
```

Nexus reruns the selector on DOM mutations and reports `parseInt(textContent)` back to the hub.

> Note: the built-in `dom` strategy handler currently lives in user preloads — if you want fully declarative DOM scraping without writing a preload, use a `preload.js` snippet like the one below or the title strategy.

### `custom` — your preload handles it

```json
"notifications": { "kind": "custom" },
"inject": { "preload": "preload.js" }
```

Your preload script calls `ipcRenderer.send('nexus:unread', count)` whenever the count changes.

## Preload template

Preloads run with `contextIsolation: true` and `sandbox: true` in the embedded view. Only `ipcRenderer.send` on the allowlisted channels reaches Nexus: `nexus:unread` and `nexus:title`.

```js
const { ipcRenderer } = require('electron');

let last = -1;

function compute() {
  // Custom logic: scrape unread counts, parse a badge, etc.
  const el = document.querySelector('.unread-count');
  return el ? parseInt(el.textContent, 10) || 0 : 0;
}

function report() {
  const count = compute();
  if (count !== last) {
    last = count;
    ipcRenderer.send('nexus:unread', count);
  }
}

const start = () => {
  report();
  new MutationObserver(() => {
    if (start._pending) return;
    start._pending = true;
    requestAnimationFrame(() => {
      start._pending = false;
      report();
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
```

## CSS injection

Anything in `inject.css` is injected after `dom-ready` via `webContents.insertCSS`. Good for hiding promo banners, fixing contrast issues, or tweaking fonts — not for feature changes.

```css
/* hide the "download our app" banner */
.promo-banner { display: none !important; }
```

## Sharing your module

Zip the module folder and share it. To install, users drop it in their modules folder and click "Reload modules" in Settings.

## Security

- Preloads run sandboxed with no Node access beyond `ipcRenderer.send` on allowlisted channels.
- Each module gets its own `persist:` partition — cookies, localStorage, and IndexedDB are isolated.
- Modules cannot talk to each other or to the Nexus shell except via the notification channels above.
- Nexus does not execute arbitrary JS from the manifest — only files referenced by `inject.*`.
