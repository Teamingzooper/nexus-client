# Userscripts

Userscripts let you inject **JavaScript or CSS** into any module to customize its look or behavior — restyle WhatsApp, hide the Teams banner, auto-clear a Telegram modal, you name it. Nexus's userscripts use the same header conventions as [Tampermonkey](https://www.tampermonkey.net/) and [Stylus](https://add0n.com/stylus.html), so most existing DOM-only scripts work unmodified.

This guide covers:

1. [The basics](#the-basics) — create your first script
2. [Header directives](#header-directives) — targeting modules and URLs
3. [JavaScript userscripts](#javascript-userscripts)
4. [CSS userscripts (user styles)](#css-userscripts-user-styles)
5. [Examples per module](#examples-per-module)
6. [Tips & limitations](#tips--limitations)

## The basics

1. Open **Settings → Userscripts**.
2. Click **+ New .user.js** (for JavaScript) or **+ New .user.css** (for pure CSS).
3. A template appears in the editor with a header block at the top. Fill in `@name`, `@module`, and `@match`, then write your code.
4. Click **Save** (or press <kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd>). The script is applied to every matching instance immediately — no reload required.
5. Use the toggle next to each script to enable or disable it without deleting.

Scripts live as plain files in your userscripts folder. Click **Open userscripts folder** in the toolbar to find them. You can edit in any external editor; Nexus hot-reloads on save.

Right-click any script in the list for **Rename**, **Duplicate**, enable/disable, or **Delete**.

## Header directives

Every userscript starts with a header block. It tells Nexus what the script is called, which module it targets, and which URLs it runs on.

```js
// ==UserScript==
// @name         Dark WhatsApp
// @description  Softens WhatsApp Web's white background
// @module       whatsapp
// @match        https://web.whatsapp.com/*
// @run-at       document-end
// ==/UserScript==
```

| Directive | Purpose |
|---|---|
| `@name` | Display name shown in the Userscripts list. Defaults to the filename if missing. |
| `@description` | Short summary. |
| `@module` | **Nexus extension.** Module id (from the module's manifest — e.g. `whatsapp`, `telegram`, `teams`, `googlechat`). Restricts the script to that service's partition so a "Dark WhatsApp" script doesn't leak into Messenger. |
| `@match` | URL pattern the script runs on. Supports `*` wildcards: `https://*.example.com/*`. Repeat the directive for multiple patterns. |
| `@run-at` | When to inject the JS: `document-end` (default, after DOM parse) or `document-idle` (after full load). `document-start` is accepted but aliased to `document-end` — Electron doesn't give us a reliable hook earlier than that. |

**Heads-up:** if you set `@module` but forget `@match`, the script won't run. Give it at least one `@match` (or use `@match https://*/*` to match any URL inside that module's partition).

## JavaScript userscripts

JavaScript runs in the **page's main world**, same as if you pasted it into DevTools. Nexus does **not** expose Tampermonkey's `GM_*` APIs (`GM_setValue`, `GM_xmlhttpRequest`, etc.). For most DOM-manipulation scripts that's fine — use `fetch`, `localStorage`, etc. directly.

Each script is wrapped in a try/catch, so a bug in one script won't break the others.

### Example: hide the Teams left rail

```js
// ==UserScript==
// @name         Hide Teams left rail
// @module       teams
// @match        https://teams.microsoft.com/*
// @run-at       document-end
// ==/UserScript==

new MutationObserver(() => {
  const rail = document.querySelector('[data-tid="app-bar"]');
  if (rail) rail.style.display = 'none';
}).observe(document.body, { childList: true, subtree: true });
```

## CSS userscripts (user styles)

CSS userscripts have a similar header, but it's wrapped in a CSS comment:

```css
/* ==UserStyle==
@name         Compact WhatsApp
@module       whatsapp
@match        https://web.whatsapp.com/*
==/UserStyle== */

#main [data-testid="conversation-panel-messages"] {
  font-size: 13px !important;
}
```

CSS is applied via Electron's `insertCSS` — it persists across navigations and is instantly updated when you save. If you disable a style, Nexus removes it from every live page without a reload.

## Examples per module

Each module has its own `@module` id. Here are the bundled ones:

| Service | `@module` | Typical `@match` |
|---|---|---|
| WhatsApp | `whatsapp` | `https://web.whatsapp.com/*` |
| Telegram | `telegram` | `https://web.telegram.org/*` |
| Messenger | `messenger` | `https://www.messenger.com/*` |
| Instagram DMs | `instagram` | `https://www.instagram.com/direct/*` |
| Microsoft Teams | `teams` | `https://teams.microsoft.com/*` |
| Google Chat | `googlechat` | `https://chat.google.com/*` |

Community modules expose their own id in their manifest.

## Tips & limitations

- **SPA navigations**: Nexus re-applies CSS when a service's URL changes (hashchange, history API) but does **not** re-run JS on in-page nav, to avoid double-binding handlers. Your script should use `MutationObserver` or event delegation if it needs to react to dynamically-mounted DOM.
- **Idempotency**: a script is re-executed on every full page load and every time you save it. Write your JS so running it twice does no harm (check `if (window.__myScriptRan) return;` if necessary).
- **No `GM_*` APIs**: plain DOM only. Scripts that require `GM_xmlhttpRequest` to bypass CORS will need to use `fetch` (subject to the page's own CORS rules) or be rewritten.
- **Errors** show in the Userscripts list next to the script's name, and the full error surfaces in DevTools (<kbd>Cmd+Alt+I</kbd> on the instance's view).
- **Sharing**: the files are plain text. Email them, gist them, or check them into git from the userscripts folder.
