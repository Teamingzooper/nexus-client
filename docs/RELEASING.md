# Releasing Nexus

Nexus ships as:

- **macOS**: `Nexus-<version>-arm64.dmg` and `Nexus-<version>-x64.dmg` (plus matching `.zip` files)
- **Windows**: `Nexus-Setup-<version>.exe` (NSIS installer)

Both are built and published to GitHub Releases automatically when you push a version tag. Users download from `https://github.com/Teamingzooper/nexus-client/releases`.

## Cut a release (the short version)

```bash
# 1. Bump version in package.json (no leading "v").
npm version patch    # or: npm version minor / npm version major

# 2. Push the commit and the tag.
git push origin main
git push origin --tags
```

The `.github/workflows/release.yml` workflow fires on any tag matching `v*`, runs unit tests, builds on both a macOS runner and a Windows runner, and uploads artifacts straight into the GitHub release that corresponds to the tag.

Typical wall-clock: **5–8 minutes** for both platforms.

## How user data survives updates

Nexus writes all user data (instances, sidebar layout, themes, session cookies/localStorage/IndexedDB, window state) to Electron's per-app `userData` directory:

| OS      | Path                                            |
| ------- | ----------------------------------------------- |
| macOS   | `~/Library/Application Support/Nexus`           |
| Windows | `%APPDATA%\Nexus`                               |
| Linux   | `~/.config/Nexus`                               |

The directory name is derived from the `productName` field in `package.json`. **Do not change `productName` or `appId` between releases** — both are part of the userData identity. If you rename the app, existing users lose their data on upgrade.

- `appId`: `com.teamingzooper.nexus`
- `productName`: `Nexus`

When a user installs a new version over the old one (via DMG drag-or-replace, NSIS "install over previous"), Electron points the new binary at the same `userData` dir and everything just works: instances stay logged in, themes stay applied, the sidebar layout is preserved.

## Local build (no publish)

To produce installers without pushing to GitHub:

```bash
npm run dist:mac      # DMG + ZIP for both arm64 and x64
npm run dist:win      # NSIS .exe (works on macOS via Wine; use a Windows box for a proper build)
npm run dist:linux    # AppImage
npm run dist:all      # everything at once (requires mac + wine for win + linux host)
```

Artifacts land in `release/`.

## Code signing (optional, recommended)

Unsigned builds work but show scary warnings:

- **macOS**: right-click → Open, then "Open Anyway" in System Settings → Privacy & Security.
- **Windows**: SmartScreen popup the first time it's run.

To sign releases properly you need:

- **macOS**: an Apple Developer ID Application certificate ($99/year). Set `CSC_LINK` (path or base64 of a `.p12`) and `CSC_KEY_PASSWORD` in the workflow. For notarization, also set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- **Windows**: a code-signing certificate (EV or standard) from a CA like DigiCert or Sectigo (~$200–$400/year). Set `CSC_LINK` and `CSC_KEY_PASSWORD` similarly.

The workflow currently sets `CSC_IDENTITY_AUTO_DISCOVERY=false` for macOS so unsigned builds don't fail locally. Remove that once you have a cert.

## Icon

A custom app icon (beyond the default Electron blue-circle placeholder) lives at:

- `build/icon.icns` (macOS)
- `build/icon.ico` (Windows)
- `build/icon.png` (Linux, at least 512×512)

electron-builder picks them up automatically. If all three are missing, you get Electron's default icon — functional but unbranded.

## First-release checklist

- [ ] `productName`, `appId`, `author.name` are stable in `package.json`
- [ ] `version` bumped
- [ ] Unit tests pass (`npm test`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Local `npm run dist:mac` produces a DMG that launches and shows the welcome screen
- [ ] Push commit, push tag
- [ ] Wait for the release workflow to finish
- [ ] Download the DMG/EXE from the release page and verify it installs and launches

## Troubleshooting

- **"dependency not in package.json" during electron-builder**: usually means a file under `node_modules` is missing a `package.json`. Delete `node_modules` and `release/`, `npm ci`, retry.
- **Mac app "is damaged and can't be opened"**: unsigned build — right-click → Open once, or run `xattr -cr /Applications/Nexus.app`.
- **Windows SmartScreen blocks install**: unsigned build — click "More info" → "Run anyway".
- **User loses data after update**: someone changed `productName` or `appId`. Check `git log -- package.json` and revert.
