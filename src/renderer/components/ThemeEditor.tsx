import React, { useState } from 'react';
import { useNexus } from '../store';
import type { Theme } from '../../shared/types';

const BUILT_IN_IDS = new Set(['nexus-dark', 'nexus-light', 'nexus-midnight']);

const COLOR_FIELDS: { key: keyof Theme['colors']; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'sidebar', label: 'Sidebar' },
  { key: 'sidebarHover', label: 'Sidebar Hover' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentFg', label: 'Accent Text' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted Text' },
  { key: 'border', label: 'Border' },
  { key: 'badge', label: 'Badge' },
  { key: 'badgeFg', label: 'Badge Text' },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export function ThemeEditor() {
  const themes = useNexus((s) => s.themes);
  const themeId = useNexus((s) => s.state.themeId);
  const setTheme = useNexus((s) => s.setTheme);
  const saveTheme = useNexus((s) => s.saveTheme);
  const deleteTheme = useNexus((s) => s.deleteTheme);

  const current = themes.find((t) => t.id === themeId) ?? themes[0];
  const [draft, setDraft] = useState<Theme | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!current) return <div>No themes available.</div>;
  const editing = draft ?? current;

  const startEdit = () => {
    setError(null);
    if (BUILT_IN_IDS.has(current.id)) {
      const baseName = `${current.name} (Custom)`;
      setDraft({ ...current, id: slugify(baseName), name: baseName });
    } else {
      setDraft({ ...current });
    }
  };

  const updateColor = (key: keyof Theme['colors'], value: string) => {
    if (!draft) return;
    setDraft({ ...draft, colors: { ...draft.colors, [key]: value } });
  };

  const commit = async () => {
    if (!draft) return;
    try {
      setError(null);
      const id = draft.id || slugify(draft.name) || 'custom';
      const next: Theme = { ...draft, id };
      await saveTheme(next);
      await setTheme(next.id);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    if (BUILT_IN_IDS.has(current.id)) return;
    try {
      await deleteTheme(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="theme-editor">
      <div className="row-actions">
        <select
          value={editing.id}
          onChange={(e) => {
            setDraft(null);
            setTheme(e.target.value);
          }}
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {BUILT_IN_IDS.has(t.id) ? ' (built-in)' : ''}
            </option>
          ))}
        </select>
        {!draft ? (
          <>
            <button onClick={startEdit}>
              {BUILT_IN_IDS.has(current.id) ? 'Duplicate' : 'Edit'}
            </button>
            {!BUILT_IN_IDS.has(current.id) && (
              <button onClick={remove} className="danger">
                Delete
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={commit}>Save</button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </>
        )}
      </div>

      {draft && (
        <>
          <input
            className="theme-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Theme name"
          />
          <input
            className="theme-name"
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: slugify(e.target.value) })}
            placeholder="id (lowercase)"
          />
        </>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="color-grid">
        {COLOR_FIELDS.map((field) => (
          <label key={field.key} className="color-field">
            <span>{field.label}</span>
            <input
              type="color"
              value={editing.colors[field.key]}
              disabled={!draft}
              onChange={(e) => updateColor(field.key, e.target.value)}
            />
            <code>{editing.colors[field.key]}</code>
          </label>
        ))}
      </div>
    </div>
  );
}
