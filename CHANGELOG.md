# Changelog

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
