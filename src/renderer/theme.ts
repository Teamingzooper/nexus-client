import type { Theme } from '../shared/types';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty('--nx-bg', c.bg);
  root.style.setProperty('--nx-sidebar', c.sidebar);
  root.style.setProperty('--nx-sidebar-hover', c.sidebarHover);
  root.style.setProperty('--nx-accent', c.accent);
  root.style.setProperty('--nx-accent-fg', c.accentFg);
  root.style.setProperty('--nx-text', c.text);
  root.style.setProperty('--nx-text-muted', c.textMuted);
  root.style.setProperty('--nx-border', c.border);
  root.style.setProperty('--nx-badge', c.badge);
  root.style.setProperty('--nx-badge-fg', c.badgeFg);
}
