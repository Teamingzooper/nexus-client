# Modules

A **module** is a messaging service Nexus knows how to display — WhatsApp, Telegram, Teams, and so on. Nexus ships with the most common ones built in. You can also install third-party modules and organize your instances however you like.

This guide covers:

1. [Using modules](#using-modules) — add services and accounts
2. [Organizing your sidebar](#organizing-your-sidebar) — groups, renaming, reordering
3. [Installing a third-party module](#installing-a-third-party-module)
4. [Making your own module](#making-your-own-module) *(optional, for tinkerers)*

## Using modules

### Add a service

1. Open **Settings → Modules**.
2. Every available service is listed with its icon and description.
3. Click **+ Add** next to the service you want. A new instance appears in your sidebar immediately.
4. Click the instance to log in — you'll see the service's own login screen, just like in a browser.

Nexus keeps each instance logged in forever (until you log out inside the service). You don't have to sign in every time you launch Nexus.

### Multiple accounts

You can add the same service multiple times. Each click of **+ Add** creates a fully independent instance with its own cookies and login. Use this to keep, say, a work WhatsApp separate from a personal WhatsApp — neither one knows about the other.

Tip: rename instances to tell them apart. Double-click an instance in the sidebar (or right-click → **Rename**) and type a new name.

### Mute, reload, delete

Right-click any instance in the sidebar for:

- **Rename** — give it a friendlier label
- **Reload** — force the service to refresh, useful if it seems stuck
- **Mute / Unmute** — silence notifications from just that instance (sidebar badges still update, but your dock/taskbar badge and native popups ignore muted instances)
- **Delete…** — removes the instance and wipes its saved login. There's no undo, so you'll be asked to confirm.

### Notifications

Notifications for every instance flow through the same system:

- **Sidebar badge** — the little number next to each instance shows its unread count.
- **Dock/taskbar badge** — the total across all unmuted instances.
- **Native popups** — the OS-level notification your computer normally shows.

Fine-tune all of this in **Settings → Notifications**: turn popups off, silence the sound, enable **Privacy mode** (replaces message previews with "New message" — handy when screen-sharing), or set **Do Not Disturb** hours.

## Organizing your sidebar

The sidebar has expandable **groups**. By default everything lands in the same group, but you can split instances into any layout you like.

- **Create a group.** Click **+ Group** at the bottom of the sidebar. Name it (e.g. "Work" or "Friends").
- **Move instances between groups.** Drag and drop.
- **Collapse / expand a group.** Click the caret next to the group name.
- **Rename a group.** Double-click its header.
- **Delete a group.** Hover its header and click the **×**. Any instances inside move to the first remaining group — their data is not touched.

### Resize the sidebar

Hover the right edge of the sidebar until you see the resize cursor, then drag. Drag far enough to the left and the sidebar snaps to an icons-only compact mode; drag back out to restore the full list.

### Jump between instances

- **⌘1**–**⌘9** / **Ctrl+1**–**Ctrl+9**: jump to the 1st–9th instance in the sidebar.
- **⌘K** / **Ctrl+K**: open the command palette, type any instance name to switch.
- **F2** (with an instance selected): rename it.

## Installing a third-party module

There are two ways to add a module that doesn't ship with Nexus.

### Option A — Browse community modules (recommended)

Nexus ships with an in-app browser for community-maintained modules hosted on GitHub.

1. Open **Settings → Modules**.
2. Click **Browse community modules**.
3. Pick one from the list and click **Install**. Nexus downloads it, unzips it into your modules folder, and reloads the module list automatically — no file copying required.

Already-installed modules show an **Installed** pill and a **Reinstall** button in case you want the latest version.

### Option B — Install by hand (for modules shared out-of-band)

If someone sends you a module folder directly (e.g. as a zip):

1. Open **Settings → Modules**.
2. Click **Open modules folder**. Nexus opens the folder where user-installed modules live.
3. Drop the module folder (the one that contains `nexus-module.json`) into this folder.
4. Back in Settings, click **Reload modules**. The new module appears in the list.

### Where modules live

| OS | Folder |
| --- | --- |
| macOS | `~/Library/Application Support/Nexus/modules/` |
| Windows | `%APPDATA%\Nexus\modules\` |
| Linux | `~/.config/Nexus/modules/` |

### Trust

Only install modules you trust. A module can't see other modules' data and can't talk to the Nexus shell beyond reporting unread counts — but it **can** inject JavaScript and CSS into the web page it wraps. That means a malicious module could, in theory, tamper with what you see in its window. Treat modules the same way you'd treat browser extensions.

## Making your own module

A module is just a folder with a JSON file. If the service you want isn't bundled and nobody's shared a module for it, you can roll your own in about two minutes.

### Minimal example

Create a folder called `my-chat` in your modules folder with these two files:

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

**`icon.svg`** — any square icon will do (SVG, or a PNG works too).

Open Settings → Modules → Reload modules, and **My Chat** shows up. Click **+ Add** to create an instance of it.

### Manifest fields

| Field | Required | What it does |
| --- | --- | --- |
| `id` | ✅ | Unique short id, lowercase letters/numbers/`-`/`_`. Used to isolate session data. |
| `name` | ✅ | Display name in Settings and the sidebar. |
| `version` | ✅ | Version string (semver recommended). |
| `url` | ✅ | The web page to embed. Must be `https://`. |
| `icon` | | Path (relative to the module folder) to an icon file. |
| `author` |  | Your name — shown in Settings. |
| `description` |  | One-line blurb — shown in Settings. |
| `allowedOrigins` |  | Extra domains to allow (for auth redirects, CDNs, etc.). See below. |
| `userAgent` |  | Override the browser user-agent string. Use when a site blocks Electron. |
| `inject.css` |  | Path to a CSS file injected into the page (handy for hiding banners). |
| `inject.preload` |  | Path to a JS file run inside the page's sandbox. |
| `notifications` |  | How to read unread counts (see below). |

### `allowedOrigins`

By default Nexus opens non-main-site links in your real browser, which is what you want *except* during login flows that redirect through third-party identity providers (Google, Microsoft, Apple, etc.). List those domains here and Nexus keeps them inside the module window long enough to finish logging in:

```json
"allowedOrigins": [
  "https://accounts.google.com",
  "https://login.microsoftonline.com"
]
```

### Unread counts

Nexus can detect unread counts three ways — pick the simplest one that matches how your service communicates unreads:

**1. From the page title.** Most web chats set `document.title` to something like `(3) My Chat`. Use:

```json
"notifications": { "kind": "title", "pattern": "\\((\\d+)\\)" }
```

**2. From a DOM element.** If the unread count lives in a badge in the page:

```json
"notifications": {
  "kind": "dom",
  "selector": ".unread-count",
  "parse": "int"
}
```

**3. Custom (with a preload script).** For everything else, write a tiny script that watches the page and reports counts. Put `preload.js` in the module folder and add:

```json
"notifications": { "kind": "custom" },
"inject": { "preload": "preload.js" }
```

Your `preload.js` just calls `ipcRenderer.send('nexus:unread', count)` whenever the count changes.

### CSS tweaks

Drop a `style.css` in your module folder and reference it:

```json
"inject": { "css": "style.css" }
```

This is how most modules hide "download our app" banners or fix contrast for dark mode.

```css
/* style.css */
.promo-banner { display: none !important; }
```

### Sharing your module

Zip the folder and send it. The person receiving it drops it in their modules folder (see above), hits **Reload modules**, and it's there.

## Security summary

- Each module has its own session — cookies, local storage, IndexedDB are isolated.
- Modules can't see each other's data or talk to other modules.
- Modules run in Electron's sandbox, so they can only call the few Nexus APIs listed above (`nexus:unread`, `nexus:notify:show`).
- Nexus never uploads your data anywhere. Everything stays between your computer and the service you're using.
