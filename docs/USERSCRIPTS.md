# Userscripts

Userscripts let you inject **JavaScript or CSS** into any module to customize its look or behavior — restyle WhatsApp, hide the Teams banner, auto-clear a Telegram modal, you name it. Nexus's userscripts use the same header conventions as [Tampermonkey](https://www.tampermonkey.net/) and [Stylus](https://add0n.com/stylus.html), so most existing DOM-only scripts work unmodified.

This guide covers:

1. [The basics](#the-basics) — create your first script
2. [Header directives](#header-directives) — targeting modules and URLs
3. [JavaScript userscripts](#javascript-userscripts)
4. [CSS userscripts (user styles)](#css-userscripts-user-styles)
5. [Examples per module](#examples-per-module)
6. [Template scripts](#template-scripts) — ready-to-tweak starters per module
7. [Tips & limitations](#tips--limitations)

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

## Template scripts

Copy-paste any of these as a starting point. Save them as `.user.js` or `.user.css` in your userscripts folder (or use **+ New** in the Userscripts settings tab) and adjust the `@module` / `@match` lines for the service you want.

> **Heads-up about selectors.** Messaging web apps ship new class names constantly, so very specific selectors like `.a-b-c__bubble` go stale fast. The templates below prefer durable hooks (semantic attributes, ARIA roles, element types) when possible, and fall back to placeholder class names with a comment telling you what to replace. If a template stops working, open DevTools (<kbd>Cmd+Alt+I</kbd>), inspect the element you want to restyle, and swap in a current selector.

### Cross-service templates (any module)

#### Bump the font size everywhere

```css
/* ==UserStyle==
@name         Bigger fonts
@match        https://*/*
==/UserStyle== */

html { font-size: 17px !important; }
```

Works in any module — change `@module` if you want it to apply to just one. CSS `font-size: 17px` on `<html>` cascades through most designs that use `rem` units.

#### Shift the brand accent with a hue rotation

```css
/* ==UserStyle==
@name         Accent hue shift
@match        https://*/*
==/UserStyle== */

/* Nudge every color 60° around the color wheel.
   Experiment with the degrees value to taste. */
:root { filter: hue-rotate(60deg); }
```

A zero-maintenance way to recolor a service without touching any specific selectors — the filter applies to the whole rendered tree.

#### Dark background wash

```css
/* ==UserStyle==
@name         Soft dark wash
@match        https://*/*
==/UserStyle== */

html { background: #0e1116 !important; }
body, #app, #root, main { background: transparent !important; }
```

Useful for services that don't ship a proper dark mode. Pair with an accent hue shift for a quick "dusk" look.

#### Auto-dismiss "Are you still there?" idle modals

```js
// ==UserScript==
// @name         Dismiss idle modals
// @match        https://*/*
// @run-at       document-end
// ==/UserScript==

new MutationObserver(() => {
  document
    .querySelectorAll('button, [role="button"]')
    .forEach((btn) => {
      const text = (btn.innerText || '').trim().toLowerCase();
      if (text === 'keep browsing' || text === "i'm still here" || text === 'continue') {
        btn.click();
      }
    });
}).observe(document.body, { childList: true, subtree: true });
```

Adapt the text list to whatever phrasing your service uses.

#### Send on Ctrl+Enter instead of Enter

```js
// ==UserScript==
// @name         Ctrl+Enter to send
// @match        https://*/*
// @run-at       document-end
// ==/UserScript==

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!target || !(target.isContentEditable || target.tagName === 'TEXTAREA')) return;
    // Bare Enter → newline. Ctrl/Cmd+Enter → pass the original Enter through as send.
    if (!e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
      // Let contenteditable's default newline behavior happen.
    }
  },
  true,
);
```

Inverts the default: plain Enter types a newline, Ctrl/Cmd+Enter sends. Useful if you constantly send half-written messages.

### WhatsApp

#### Compact message list

```css
/* ==UserStyle==
@name         Compact WhatsApp
@module       whatsapp
@match        https://web.whatsapp.com/*
==/UserStyle== */

#main [role="row"] { padding-top: 2px !important; padding-bottom: 2px !important; }
#main [role="row"] span.selectable-text { font-size: 13.5px !important; line-height: 1.35 !important; }
```

Tightens vertical spacing between messages so more fit on screen.

#### Hide the status / "Updates" tab

```css
/* ==UserStyle==
@name         Hide WhatsApp Updates tab
@module       whatsapp
@match        https://web.whatsapp.com/*
==/UserStyle== */

/* The left nav is identified by aria-label; replace the text if your locale differs. */
button[aria-label="Status"], button[aria-label="Updates"] { display: none !important; }
```

If the selector doesn't match, inspect the nav in DevTools — WhatsApp labels vary by language.

#### Softer green accent

```css
/* ==UserStyle==
@name         Softer WhatsApp green
@module       whatsapp
@match        https://web.whatsapp.com/*
==/UserStyle== */

:root {
  --primary: #4a7a64 !important;
  --teal-light: #4a7a64 !important;
  --unread-marker-background: #4a7a64 !important;
}
```

WhatsApp exposes its greens as CSS custom properties on `:root`. Change the color values to anything you like.

### Telegram

#### Hide the stories bar

```css
/* ==UserStyle==
@name         Hide Telegram stories
@module       telegram
@match        https://web.telegram.org/*
==/UserStyle== */

.stories-list, .sidebar-stories, [class*="Stories"] { display: none !important; }
```

Targets a few variants of the stories container — Telegram has gone through several class-name schemes across their K/A/Z web clients.

#### Rounder message bubbles

```css
/* ==UserStyle==
@name         Rounder Telegram bubbles
@module       telegram
@match        https://web.telegram.org/*
==/UserStyle== */

.bubble { border-radius: 18px !important; }
.bubble.is-out { border-bottom-right-radius: 6px !important; }
.bubble.is-in { border-bottom-left-radius: 6px !important; }
```

#### Custom sidebar accent

```css
/* ==UserStyle==
@name         Telegram purple accent
@module       telegram
@match        https://web.telegram.org/*
==/UserStyle== */

:root {
  --primary-color: #8e6bd4 !important;
  --message-out-primary-color: #8e6bd4 !important;
  --link-color: #8e6bd4 !important;
}
```

### Messenger

#### Hide stories strip at the top of the chat list

```css
/* ==UserStyle==
@name         Hide Messenger stories
@module       messenger
@match        https://www.messenger.com/*
==/UserStyle== */

/* The stories tray is a horizontal scroll container near the top of the chat list. */
[aria-label="Stories"], [data-pagelet*="Stories"] { display: none !important; }
```

#### Compact chat list rows

```css
/* ==UserStyle==
@name         Compact Messenger list
@module       messenger
@match        https://www.messenger.com/*
==/UserStyle== */

[role="grid"] [role="row"] { min-height: 48px !important; }
[role="grid"] [role="row"] img { width: 32px !important; height: 32px !important; }
```

#### Dim "seen" indicators

```css
/* ==UserStyle==
@name         Subtle seen indicators
@module       messenger
@match        https://www.messenger.com/*
==/UserStyle== */

[aria-label*="Seen"], [aria-label*="Delivered"] { opacity: 0.35 !important; }
```

### Instagram DMs

#### Hide the "Suggested" sidebar

```css
/* ==UserStyle==
@name         Hide Instagram suggestions
@module       instagram
@match        https://www.instagram.com/direct/*
==/UserStyle== */

aside[aria-label="Suggested for you"],
section:has(> div > h2:first-child) aside { display: none !important; }
```

#### Bigger message area

```css
/* ==UserStyle==
@name         Bigger Instagram DMs
@module       instagram
@match        https://www.instagram.com/direct/*
==/UserStyle== */

main[role="main"] section { max-width: none !important; }
main[role="main"] section > div { font-size: 15px !important; }
```

#### Hide the "get the app" banner

```js
// ==UserScript==
// @name         Hide Instagram app banner
// @module       instagram
// @match        https://www.instagram.com/direct/*
// @run-at       document-end
// ==/UserScript==

new MutationObserver(() => {
  document
    .querySelectorAll('div[role="dialog"], div[aria-label*="app" i]')
    .forEach((el) => {
      if (/download|install|get the app/i.test(el.innerText || '')) {
        el.remove();
      }
    });
}).observe(document.body, { childList: true, subtree: true });
```

### Microsoft Teams

#### Hide the left app rail

```css
/* ==UserStyle==
@name         Hide Teams left rail
@module       teams
@match        https://teams.microsoft.com/*
==/UserStyle== */

[data-tid="app-bar"] { display: none !important; }
[data-tid="app-layout"] { grid-template-columns: 0 auto 1fr !important; }
```

Gives you more horizontal room for the chat list + conversation.

#### Hide the "New" banner / promos

```css
/* ==UserStyle==
@name         Hide Teams promo banners
@module       teams
@match        https://teams.microsoft.com/*
==/UserStyle== */

[data-tid*="banner"], [aria-label*="promo" i], [data-tid="info-bar"] { display: none !important; }
```

#### Shrink the meeting command bar

```css
/* ==UserStyle==
@name         Compact Teams meeting bar
@module       teams
@match        https://teams.microsoft.com/*
==/UserStyle== */

[data-tid="calling-controls"] button { padding: 6px 10px !important; }
[data-tid="calling-controls"] { gap: 4px !important; }
```

#### Compact chat list

```css
/* ==UserStyle==
@name         Compact Teams chat list
@module       teams
@match        https://teams.microsoft.com/*
==/UserStyle== */

[data-tid="chat-list"] [role="treeitem"] { min-height: 44px !important; }
[data-tid="chat-list"] img { width: 28px !important; height: 28px !important; }
```

### Google Chat

#### Hide the "Spaces" or "Meet" panels

```css
/* ==UserStyle==
@name         Google Chat — DMs only
@module       googlechat
@match        https://chat.google.com/*
==/UserStyle== */

/* Hide sidebar sections by their aria labels. Replace the labels if your
   locale differs (e.g. "Spaces" → "Espaces"). */
div[aria-label="Spaces"], div[aria-label="Meet"] { display: none !important; }
```

#### Compact message spacing

```css
/* ==UserStyle==
@name         Compact Google Chat
@module       googlechat
@match        https://chat.google.com/*
==/UserStyle== */

c-wiz [role="listitem"] { padding-top: 4px !important; padding-bottom: 4px !important; }
c-wiz [role="listitem"] [role="presentation"] { font-size: 13.5px !important; }
```

Google Chat wraps each message in a `<c-wiz>` custom element — that selector is remarkably stable across redesigns.

#### Re-color the send button

```css
/* ==UserStyle==
@name         Google Chat teal send button
@module       googlechat
@match        https://chat.google.com/*
==/UserStyle== */

button[aria-label="Send message"] { background: #0f9d9d !important; color: white !important; }
```

### Utility JS snippets

#### Keep-me-signed-in (auto-check that box)

```js
// ==UserScript==
// @name         Auto check keep-me-signed-in
// @match        https://*/*
// @run-at       document-end
// ==/UserScript==

new MutationObserver(() => {
  document
    .querySelectorAll('input[type="checkbox"]')
    .forEach((cb) => {
      const label = cb.closest('label')?.innerText || '';
      if (/stay signed in|keep me logged in|remember me/i.test(label) && !cb.checked) {
        cb.click();
      }
    });
}).observe(document.body, { childList: true, subtree: true });
```

#### Notify in the console when you're mentioned

```js
// ==UserScript==
// @name         Console ping on @mentions
// @module       teams
// @match        https://teams.microsoft.com/*
// @run-at       document-end
// ==/UserScript==

new MutationObserver((muts) => {
  for (const m of muts) {
    for (const node of m.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const text = node.innerText || '';
      if (text.includes('@you') || /@your-name/i.test(text)) {
        console.log('[mention]', text.slice(0, 120));
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });
```

Replace `@your-name` with your actual handle. Useful as a base for more elaborate auto-reactions.

#### Force dark mode when the OS is light

```js
// ==UserScript==
// @name         Force dark mode preference
// @match        https://*/*
// @run-at       document-end
// ==/UserScript==

// Some apps gate dark mode on prefers-color-scheme. This shims the match so
// the service thinks you want dark — useful if you're on a light-mode OS.
const origMatch = window.matchMedia;
window.matchMedia = function (q) {
  const m = origMatch.call(this, q);
  if (/prefers-color-scheme:\s*dark/.test(q)) {
    return { ...m, matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} };
  }
  return m;
};
```

Won't help if the app stores its own theme preference — toggle it once inside the app first and this will keep it stuck on dark.

## Tips & limitations

- **SPA navigations**: Nexus re-applies CSS when a service's URL changes (hashchange, history API) but does **not** re-run JS on in-page nav, to avoid double-binding handlers. Your script should use `MutationObserver` or event delegation if it needs to react to dynamically-mounted DOM.
- **Idempotency**: a script is re-executed on every full page load and every time you save it. Write your JS so running it twice does no harm (check `if (window.__myScriptRan) return;` if necessary).
- **No `GM_*` APIs**: plain DOM only. Scripts that require `GM_xmlhttpRequest` to bypass CORS will need to use `fetch` (subject to the page's own CORS rules) or be rewritten.
- **Errors** show in the Userscripts list next to the script's name, and the full error surfaces in DevTools (<kbd>Cmd+Alt+I</kbd> on the instance's view).
- **Sharing**: the files are plain text. Email them, gist them, or check them into git from the userscripts folder.
