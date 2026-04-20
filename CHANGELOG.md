# Changelog

## 1.3.1 — 2026-04-20

### Fixes
- **Auto-updater manifest missing on releases**: the release workflow was building the `latest-mac.yml` / `latest.yml` / `latest-linux.yml` updater manifests but not uploading them to the GitHub release. Without those files, electron-updater couldn't find available updates, so "Check for updates" in 1.2.1 / 1.3.0 clients returned `cannot find latest.yml`. Manifests are now shipped with every release, and Mac `.zip` artifacts are re-attached (electron-updater on macOS uses the zip as the primary update payload).

## 1.3.0 — 2026-04-20

### Features
- **System tray / menu bar icon**: Nexus now runs in the system tray (or macOS menu bar). Left-click toggles the window; right-click opens a menu listing every instance with its unread count, plus shortcuts to Settings, New Instance, and Quit. The tray tooltip shows the total unread count.
- **Optional close-to-tray**: a new toggle in **Settings → General** keeps Nexus running in the tray when you close the window, so notifications keep arriving. Quit via the tray menu or ⌘Q / Ctrl+Q.
- **Configurable global show/hide shortcut**: enable in **Settings → General** and pick any Electron accelerator (default ``Alt+` ``) to summon or hide Nexus from anywhere.
- **Community modules browser**: **Settings → Modules → Browse community modules** fetches third-party modules from the latest `community-v*` release on GitHub and installs them with one click. The first community module, **WeChat**, is available now.
- **Linux AppImage** is built and attached to every release alongside the macOS DMG and Windows installer.

### Under the hood
- New `community-modules/` folder in the repo + `.github/workflows/community-modules.yml` that packages each subfolder into a `.zip` and publishes it as a GitHub release on `community-v*` tags. `scripts/pack-community-modules.js` also emits an `index.json` manifest the in-app browser consumes.
- `scripts/build-updater-yml.js` learned a `linux` target so electron-updater can read an AppImage release.

## 1.2.1 — 2026-04-20

### Fixes
- **Windows topbar alignment** (#2): the app header no longer reserves macOS-only traffic-light space on Windows, so the logo, Settings button, and breadcrumb now sit flush against the left edge on Windows and Linux.
- **Teams notifications** (#4): the Notification API shim is now injected into every frame in each module view (not just the top frame), and into late-created iframes as they load. Teams renders chat, activity, and calls in iframes, so popups fired from those subframes were previously silent — they now come through.

### Features
- **Drag-to-resize sidebar** (#3): the sidebar edge is now a resize handle. Drag it to size the sidebar anywhere from 200–420 px; drag it below the threshold to snap to icons-only compact mode, drag it back out to restore. The old "Compact sidebar" checkbox in Settings is gone — one gesture now does both jobs.
- **Updates section in Settings**: a new **Updates** tab shows your current version, lets you manually check for new releases, and displays the release name, version, release date, and changelog for any update that's available. Click **Install and restart** to update in place — your profiles, module instances, and saved logins are preserved, no reinstall or re-login required.

### Other
- Cleaner `.gitignore` around test/Playwright artifacts.
- User-facing documentation rewrite: `README.md`, `docs/MODULES.md`, and `docs/THEMES.md` are now aimed at end users installing and using Nexus, with tutorials for modules and theming.

## 1.2.0 — 2026-04-17

### Features
- **Microsoft Teams module**: bundled Teams web client with OAuth-aware navigation (login.microsoftonline.com, login.live.com, teams.live.com, etc.)
- **`allowedOrigins` manifest field**: modules can now whitelist additional origins so auth/redirect flows complete in-place instead of bouncing to the system browser
- **Sidebar context menu**: right-click an instance for Rename, Reload, Mute/Unmute, and Delete — closes on click-away, Escape, or another right-click

### Improvements
- Navigation guard honors manifest `allowedOrigins` for both top-frame navigations and window-open requests
- Teams launches against the modern `/v2/` SPA with an Edge UA so Microsoft treats it as a first-class browser (no "download the app" nag)

## 1.1.0 — 2026-04-16

### Features
- **Profiles**: per-profile instances with password-locked profile support
- **Auto-updater**: in-app update banner with download/install flow
- **Command palette**: quick-access command palette (Cmd/Ctrl+K)
- **Notification privacy mode**: redact message content in notifications
- **Do Not Disturb**: configurable DND time window to suppress notifications
- **Instance muting**: mute individual instances to suppress their notifications and dock badge contributions

### Improvements
- **Notification icon fix (macOS)**: notifications now show a single app icon instead of a duplicate "content image"
- **Mute button**: replaced emoji toggle with a clean SVG speaker icon; merged redundant muted indicator into a single toggle
- **Notification formatting**: dropped redundant `[Nexus]` prefix and subtitle from native notifications
- **Dock badge**: muted instances no longer inflate the dock badge count
- **Stale badge fix**: notification counts reset correctly on profile switch

### Dependency upgrades
- Electron 30 → 41 (fixes 17 security advisories)
- electron-builder 24 → 26 (fixes tar/proxy vulnerabilities)
- Vite 5 → 8, Vitest 1 → 4, @vitejs/plugin-react 4 → 6
- Zod 3 → 4, Zustand 4 → 5
- Playwright 1.44 → 1.59, concurrently 8 → 9, cross-env 7 → 10, wait-on 7 → 9
- **0 npm audit vulnerabilities** (was 10)

## 1.0.0 — 2026-04-13

Initial release.
