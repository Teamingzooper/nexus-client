# Nexus

**All your messaging apps in one window.**

Nexus is a clean, themeable desktop client that pulls WhatsApp, Telegram, Messenger, Microsoft Teams, Google Chat, and anything else with a web chat into a single app. One window, one theme, one notification badge — and each service is still the real web app, with your real logins.

## Download

Grab the latest installer for your platform from the [Releases page](https://github.com/Teamingzooper/nexus-client/releases/latest):

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `Nexus-<version>-arm64.dmg` |
| macOS (Intel) | `Nexus-<version>-x64.dmg` |
| Windows | `Nexus-Setup-<version>.exe` |
| Linux | `Nexus-<version>.AppImage` |

### First launch

Nexus is not code-signed yet (Apple Developer certificates cost $99/year — we'll get there), so your OS will show a scary-looking warning the first time you open it. One command or a couple of clicks, and you're in forever.

#### macOS

After you drag Nexus into Applications, launching may show **"Nexus is damaged and can't be opened. You should move it to the Trash."** — this is misleading. The app is fine; macOS is just refusing to open an unsigned download. Clear the download-quarantine flag once:

1. Open **Terminal** (Applications → Utilities → Terminal, or ⌘Space → "Terminal").
2. Paste and run:

   ```bash
   xattr -cr /Applications/Nexus.app
   ```

3. Open Nexus normally. It'll launch and remember your choice — you never have to do this again.

If you see a milder **"can't be opened because it is from an unidentified developer"** message instead, right-click the app → **Open** → click **Open** in the dialog. Same result, no Terminal needed.

#### Windows

SmartScreen may show a warning the first time you run the installer. Click **More info → Run anyway**.

## Getting started

1. Launch Nexus. You'll see an empty welcome screen.
2. Click **Settings** in the top-left.
3. Open the **Modules** tab. Every messaging service that Nexus knows about is listed.
4. Click **+ Add** next to the service you want (e.g. WhatsApp).
5. Close Settings. The new instance is in the left sidebar — click it to log in.

Each instance remembers its own login. Want two WhatsApps (work + personal)? Click **+ Add** on WhatsApp twice. Right-click an instance in the sidebar to rename, mute, reload, or delete it.

Keyboard shortcuts: **⌘,** / **Ctrl+,** opens Settings, **⌘R** / **Ctrl+R** reloads the current instance, **⌘1**–**⌘9** jumps between instances.

## Features

- **Real web apps, isolated.** Each service runs in its own sandbox, so WhatsApp can't see Telegram's cookies, and vice versa.
- **Multiple accounts per service.** Add as many instances of any service as you want. Perfect for "work" vs "personal" splits.
- **Unified notifications.** A single badge on your dock or taskbar shows the total unread count across everything. Per-instance badges in the sidebar show where to look.
- **Do Not Disturb, privacy mode, per-instance mute.** All in Settings → Notifications.
- **Themes.** Pick a built-in theme or design your own in the in-app theme editor — no CSS required.
- **Userscripts.** Inject your own JavaScript or CSS into any module — Tampermonkey/Stylus-style. Restyle WhatsApp, hide the Teams rail, tweak anything you want. Paste existing DOM-only Tampermonkey scripts and they just work.
- **Profiles.** Optional password-protected profiles let you keep separate sets of instances (e.g. a personal profile and a work profile) on the same machine.
- **System tray + global hotkey.** Keep Nexus running in the tray / menu bar and summon it from anywhere with a configurable keyboard shortcut.
- **In-place updates.** When a new version is available, the Updates tab shows the release notes and a **Download update** button. Your logins and settings are preserved across upgrades.

## Guides

- [**Modules**](docs/MODULES.md) — add, organize, and (optionally) create your own messaging modules.
- [**Themes**](docs/THEMES.md) — customize every color in the app.
- [**Userscripts**](docs/USERSCRIPTS.md) — inject your own JS/CSS into any module.

## Supported services (out of the box)

- WhatsApp
- Telegram
- Messenger
- Instagram
- Microsoft Teams
- Google Chat

More can be added as modules — see the [Modules guide](docs/MODULES.md). A growing set of community modules (WeChat and more) are one click away under **Settings → Modules → Browse community modules**.

## Privacy

Nexus never sends your messages, contacts, or logins anywhere. Each service talks directly to its own servers — Nexus is just the window. Session data (cookies, local storage) lives on your machine in the standard OS-level app-data folder and never leaves it.

## Support

Found a bug or have an idea? [Open an issue](https://github.com/Teamingzooper/nexus-client/issues).

## License

MIT
