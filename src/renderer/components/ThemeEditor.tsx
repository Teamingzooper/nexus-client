import React, { useState } from 'react';
import { useNexus } from '../store';
import type { Theme } from '../../shared/types';

const BUILT_IN_IDS = new Set(['nexus-dark', 'nexus-light']);

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

export function ThemeEditor() {
  const themes = useNexus((s) => s.themes);
  const themeId = useNexus((s) => s.state.themeId);
  const setTheme = useNexus((s) => s.setTheme);
  const saveTheme = useNexus((s) => s.saveTheme);

  const current = themes.find((t) => t.id === themeId) ?? themes[0];
  const [draft, setDraft] = useState<Theme | null>(null);

  const editing = draft ?? current;
  if (!editing) return <div>No themes available.</div>;

  const startEdit = () => {
    const id = BUILT_IN_IDS.has(current.id) ? `${current.id}-custom` : current.id;
    setDraft({ ...current, id, name: BUILT_IN_IDS.has(current.id) ? `${current.name} (Custom)` : current.name });
  };

  const updateColor = (key: keyof Theme['colors'], value: string) => {
    if (!draft) return;
    setDraft({ ...draft, colors: { ...draft.colors, [key]: value } });
  };

  const commit = async () => {
    if (!draft) return;
    await saveTheme(draft);
    await setTheme(draft.id);
    setDraft(null);
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
            </option>
          ))}
        </select>
        {!draft ? (
          <button onClick={startEdit}>Edit / Duplicate</button>
        ) : (
          <>
            <button onClick={commit}>Save</button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </>
        )}
      </div>

      {draft && (
        <input
          className="theme-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Theme name"
        />
      )}

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
