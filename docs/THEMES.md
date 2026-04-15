# Themes

Themes in Nexus are JSON. They drive CSS custom properties on `:root`, so all shell styling updates instantly when the theme changes.

## Format

```json
{
  "id": "nexus-dark",
  "name": "Nexus Dark",
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

## Built-in themes

- `nexus-dark` — default, Tokyo Night-ish palette.
- `nexus-light` — bright alternative.

Built-ins cannot be overwritten; the theme editor forks them to `-custom` IDs when you edit.

## User themes

Saved to `~/Library/Application Support/Nexus/nexus-themes.json` as a JSON array. You can edit this file directly or use the in-app theme editor (Settings → Themes).

## CSS variables

Each color maps to a CSS custom property used by `styles.css`:

| JSON key | CSS variable |
|---|---|
| `bg` | `--nx-bg` |
| `sidebar` | `--nx-sidebar` |
| `sidebarHover` | `--nx-sidebar-hover` |
| `accent` | `--nx-accent` |
| `accentFg` | `--nx-accent-fg` |
| `text` | `--nx-text` |
| `textMuted` | `--nx-text-muted` |
| `border` | `--nx-border` |
| `badge` | `--nx-badge` |
| `badgeFg` | `--nx-badge-fg` |

Themes only style the Nexus shell (sidebar, modal, content background). They cannot restyle the embedded messaging sites — those are controlled by each module's `inject.css`.
