import React, { useEffect, useState } from 'react';
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

function uniqueId(desired: string, existing: Set<string>): string {
  if (!existing.has(desired)) return desired;
  let n = 2;
  while (existing.has(`${desired}-${n}`)) n += 1;
  return `${desired}-${n}`;
}

export function ThemeEditor() {
  const themes = useNexus((s) => s.themes);
  const themeId = useNexus((s) => s.state.themeId);
  const setTheme = useNexus((s) => s.setTheme);
  const saveTheme = useNexus((s) => s.saveTheme);
  const deleteTheme = useNexus((s) => s.deleteTheme);
  const exportThemePack = useNexus((s) => s.exportThemePack);
  const importThemePack = useNexus((s) => s.importThemePack);
  const setPreviewTheme = useNexus((s) => s.setPreviewTheme);

  const current = themes.find((t) => t.id === themeId) ?? themes[0];
  const [draft, setDraft] = useState<Theme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const displayed = draft ?? current;

  // Push the draft through the store's previewTheme slot so App.tsx's single
  // theme-application effect handles it. When ThemeEditor unmounts, clear the
  // preview so the saved theme is restored.
  useEffect(() => {
    setPreviewTheme(draft);
    return () => setPreviewTheme(null);
  }, [draft, setPreviewTheme]);

  if (!current) return <div>No themes available.</div>;

  const existingIds = new Set(themes.map((t) => t.id));

  /**
   * Change a color. If we're not already editing, auto-create a draft:
   *  - built-in theme → duplicate into a new editable copy with a unique id
   *  - custom theme   → edit in place
   */
  const changeColor = (key: keyof Theme['colors'], value: string) => {
    setError(null);
    if (!draft) {
      let base: Theme;
      if (BUILT_IN_IDS.has(current.id)) {
        const baseName = `${current.name} (Custom)`;
        const baseId = uniqueId(slugify(baseName) || 'custom', existingIds);
        base = { ...current, id: baseId, name: baseName };
      } else {
        base = { ...current };
      }
      setDraft({ ...base, colors: { ...base.colors, [key]: value } });
      return;
    }
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
      setFlash('Theme saved');
      setTimeout(() => setFlash(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancel = () => {
    setError(null);
    setDraft(null);
  };

  const remove = async () => {
    if (BUILT_IN_IDS.has(current.id)) return;
    try {
      await deleteTheme(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const exportCurrent = async () => {
    try {
      setError(null);
      const result = await exportThemePack([displayed.id], { name: displayed.name });
      if (!result.canceled) {
        setFlash(`Exported to ${result.path}`);
        setTimeout(() => setFlash(null), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const exportAllCustom = async () => {
    try {
      setError(null);
      const ids = themes.filter((t) => !BUILT_IN_IDS.has(t.id)).map((t) => t.id);
      if (ids.length === 0) {
        setError('No custom themes to export. Create one first.');
        return;
      }
      const result = await exportThemePack(ids, { name: 'My Nexus themes' });
      if (!result.canceled) {
        setFlash(`Exported ${result.count} themes`);
        setTimeout(() => setFlash(null), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const importPack = async () => {
    try {
      setError(null);
      const result = await importThemePack();
      if (!result.canceled && result.added && result.added.length > 0) {
        setFlash(`Imported ${result.added.length} theme(s)`);
        setTimeout(() => setFlash(null), 2500);
        // Switch to the first imported theme so the user sees it immediately.
        await setTheme(result.added[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="theme-editor">
      <div className="row-actions">
        <select
          value={displayed.id}
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
        {draft ? (
          <>
            <button onClick={commit}>Save</button>
            <button onClick={cancel}>Cancel</button>
          </>
        ) : (
          !BUILT_IN_IDS.has(current.id) && (
            <button onClick={remove} className="danger">
              Delete
            </button>
          )
        )}
      </div>

      <div className="row-actions">
        <button onClick={importPack} title="Load a theme pack from disk">
          Import pack…
        </button>
        <button onClick={exportCurrent} title="Save this theme as a shareable pack">
          Export current
        </button>
        <button onClick={exportAllCustom} title="Save all custom themes as one pack">
          Export all custom
        </button>
      </div>

      {draft && (
        <>
          <label className="theme-field">
            <span>Name</span>
            <input
              className="theme-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Theme name"
            />
          </label>
          <label className="theme-field">
            <span>Id</span>
            <input
              className="theme-name"
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: slugify(e.target.value) })}
              placeholder="lowercase-id"
            />
          </label>
        </>
      )}

      {error && <div className="error-message">{error}</div>}
      {flash && <div className="flash-message">{flash}</div>}

      {!draft && BUILT_IN_IDS.has(current.id) && (
        <p className="editor-hint">
          Tip: pick a color below to automatically create an editable copy of this built-in
          theme.
        </p>
      )}

      <div className="color-grid">
        {COLOR_FIELDS.map((field) => (
          <label key={field.key} className="color-field">
            <span>{field.label}</span>
            <input
              type="color"
              value={displayed.colors[field.key]}
              onChange={(e) => changeColor(field.key, e.target.value)}
            />
            <code>{displayed.colors[field.key]}</code>
          </label>
        ))}
      </div>
    </div>
  );
}
