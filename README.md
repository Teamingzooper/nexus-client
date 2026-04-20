# Nexus

**All your messaging apps in one window.**

Nexus is a clean, themeable desktop client that pulls WhatsApp, Telegram, Messenger, Microsoft Teams, and anything else with a web chat into a single app. One window, one theme, one notification badge — and each service is still the real web app, with your real logins.

## Download

Grab the latest installer for your platform from the [Releases page](https://github.com/Teamingzooper/nexus-client/releases/latest):

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `Nexus-<version>-arm64.dmg` |
| macOS (Intel) | `Nexus-<version>-x64.dmg` |
| Windows | `Nexus-Setup-<version>.exe` |

### First launch

- **macOS**: if you see "Nexus can't be opened because it is from an unidentified developer", right-click the app, choose **Open**, then click **Open** in the dialog. macOS remembers your choice after that.
- **Windows**: SmartScreen may show a warning the first time you run the installer. Click **More info → Run anyway**.

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
- **Profiles.** Optional password-protected profiles let you keep separate sets of instances (e.g. a personal profile and a work profile) on the same machine.
- **In-place updates.** When a new version ships, Nexus downloads it quietly in the background. Click **Install and restart** when it's ready — your logins and settings are preserved.

## Guides

- [**Modules**](docs/MODULES.md) — add, organize, and (optionally) create your own messaging modules.
- [**Themes**](docs/THEMES.md) — customize every color in the app.

## Supported services (out of the box)

- WhatsApp
- Telegram
- Messenger
- Instagram
- Microsoft Teams

More can be added as modules — see the [Modules guide](docs/MODULES.md).

## Privacy

Nexus never sends your messages, contacts, or logins anywhere. Each service talks directly to its own servers — Nexus is just the window. Session data (cookies, local storage) lives on your machine in the standard OS-level app-data folder and never leaves it.

## Support

Found a bug or have an idea? [Open an issue](https://github.com/Teamingzooper/nexus-client/issues).

## License

MIT
