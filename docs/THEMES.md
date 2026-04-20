# Themes

Nexus is fully themeable. Pick one of the built-in themes, tweak colors with color pickers, export your theme to share with friends — no editing files, no CSS skills required.

## Pick a built-in theme

1. Open **Settings → Themes**.
2. Every theme (built-in and custom) is in the list.
3. Click a theme to apply it instantly.

Nexus ships with **Nexus Dark** (default, cool blue-violet palette) and **Nexus Light** (bright alternative). Built-ins can't be overwritten — when you edit one, Nexus automatically makes you a copy to work on.

## Customize a theme

1. In **Settings → Themes**, click the theme you want to base your custom theme on.
2. Click **Edit** (or **Duplicate** if you want to keep the original untouched).
3. Each color in the palette has a color picker. Click a swatch and drag the picker around — the whole app recolors live as you go.
4. Change the name at the top if you like.
5. Click **Save**.

Your custom theme stays in the list and syncs with whatever profile you're using.

### What each color controls

| Color | Where it shows up |
| --- | --- |
| **Background** | The blank canvas behind everything. |
| **Sidebar** | The module list on the left. |
| **Sidebar hover** | The highlight you see when you mouse over sidebar items. |
| **Accent** | Active instance highlight, buttons you can click, focus rings. |
| **Accent foreground** | Text that sits on top of an accent color (needs to stay readable). |
| **Text** | Primary text — headings, labels, values. |
| **Muted text** | Secondary text — subtitles, hints, disabled labels. |
| **Border** | Lines between sections (sidebar edge, card outlines, modal edges). |
| **Badge** | Unread-count bubbles and other alert-y accents. |
| **Badge foreground** | Numbers inside badges. |

### Tip: contrast

Pick colors that stay readable. A good rule of thumb: the *accent* and *text* colors should be dramatically lighter or darker than *background* and *sidebar*, and *muted text* should sit somewhere in between. The editor shows everything live — if it looks wrong, it *is* wrong.

## Share a theme

- **Settings → Themes → Export…** bundles any combination of your themes into a single file (`.nxthemes`). Send that file to a friend.
- **Settings → Themes → Import…** installs a theme pack someone has sent you. All of its themes show up in your list instantly.

Theme packs can optionally carry a name and author ("Michael's Pastels by Michael Silverstein") that Nexus shows on import.

## Advanced: editing the JSON directly

Themes are just JSON. You don't need to touch these files unless you want to — the in-app editor does everything they do — but it's here if you prefer a text editor or version-controlled dotfiles.

Theme files live at:

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Nexus/nexus-themes.json` |
| Windows | `%APPDATA%\Nexus\nexus-themes.json` |
| Linux | `~/.config/Nexus/nexus-themes.json` |

The file is a JSON array of theme objects. Each theme looks like this:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "colors": {
    "bg":           "#1a1b26",
    "sidebar":      "#16161e",
    "sidebarHover": "#24263a",
    "accent":       "#7aa2f7",
    "accentFg":     "#0b0c10",
    "text":         "#c0caf5",
    "textMuted":    "#7982a9",
    "border":       "#2a2b3d",
    "badge":        "#f7768e",
    "badgeFg":      "#ffffff"
  }
}
```

### Rules

- `id` must be unique and lowercase (`a–z`, `0–9`, `-`, `_`).
- Every color must be a hex value (`#rgb`, `#rrggbb`, or `#rrggbbaa`).
- Nexus validates the file on startup and falls back to the built-in dark theme if anything's invalid.

### What themes *can't* change

Themes only style Nexus's own shell — the sidebar, settings panels, badges, and so on. They can't restyle the embedded services themselves, because those are the real WhatsApp / Telegram / Teams web apps and Nexus stays out of their way.

If you want to restyle a specific service (for example, hide a banner inside WhatsApp), that's a module-level CSS injection — see the [Modules guide](MODULES.md#css-tweaks).
