# Community userscripts

This folder holds community-contributed `.user.js` and `.user.css` files that Nexus publishes as a downloadable catalogue via the **Userscripts → Browse community scripts** button in the app.

## Layout

One file per script, named with the `.user.js` or `.user.css` extension:

```
community-userscripts/
├── dark-whatsapp.user.css
├── compact-teams.user.css
├── auto-click-stay-signed-in.user.js
└── README.md
```

## Each file must have a header

Every script needs the same Tampermonkey/Stylus-style header that in-app userscripts use. The header drives the entry shown in the browser.

**`.user.js`:**

```js
// ==UserScript==
// @name         Dark WhatsApp
// @description  Softens WhatsApp Web's bright background
// @author       your-github-handle
// @version      1.0.0
// @module       whatsapp
// @match        https://web.whatsapp.com/*
// @run-at       document-end
// ==/UserScript==
```

**`.user.css`:**

```css
/* ==UserStyle==
@name         Compact Teams
@description  Tightens the Teams chat list spacing
@author       your-github-handle
@version      1.0.0
@module       teams
@match        https://teams.microsoft.com/*
==/UserStyle== */
```

The `@author` and `@version` directives are surfaced in the browser; `@name`, `@description`, `@module`, and `@match` are required for your script to be listed.

## Publishing

Push a tag like `community-userscripts-v1` to this repo. The **Community Userscripts** GitHub Actions workflow packages every `.user.{js,css}` file in this folder into a release, plus an `index.json` manifest that the in-app browser reads.

## Contributing

1. Fork this repo.
2. Add your script to `community-userscripts/`.
3. Test it locally by dropping it in your Nexus userscripts folder (**Settings → Userscripts → Open userscripts folder**).
4. Open a PR. Include a screenshot or GIF of the before/after if it's a visual change.

See [docs/USERSCRIPTS.md](../docs/USERSCRIPTS.md) for the full script-authoring guide.
