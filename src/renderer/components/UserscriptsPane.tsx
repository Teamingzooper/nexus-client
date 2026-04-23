import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNexus } from '../store';
import type { Userscript, UserscriptSummary } from '../../shared/userscripts';

const TUTORIAL_URL =
  'https://github.com/Teamingzooper/nexus-client/blob/main/docs/USERSCRIPTS.md';

const JS_TEMPLATE = `// ==UserScript==
// @name         New userscript
// @description  Describe what this does
// @module       whatsapp
// @match        https://web.whatsapp.com/*
// @run-at       document-end
// ==/UserScript==

// Plain DOM access — no GM_* APIs. Runs on the page's main world.
console.log('Hello from Nexus userscript');
`;

const CSS_TEMPLATE = `/* ==UserStyle==
@name         New user style
@description  Describe what this restyles
@module       whatsapp
@match        https://web.whatsapp.com/*
==/UserStyle== */

/* Put your CSS here. */
`;

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

interface ContextMenuState {
  filename: string;
  x: number;
  y: number;
}

export function UserscriptsPane() {
  const modules = useNexus((s) => s.modules);

  const [scripts, setScripts] = useState<UserscriptSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Userscript | null>(null);
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try {
      const list = await window.nexus.listUserscripts();
      setScripts(list);
    } catch (err) {
      console.error('list userscripts failed', err);
    }
  };

  useEffect(() => {
    refresh();
    const off = window.nexus.onUserscriptsChanged((list) => {
      setScripts(list);
      if (selected && !dirty) loadInto(selected);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dismiss the context menu on outside click, Escape, or scroll.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', () => setMenu(null), true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const loadInto = async (filename: string) => {
    try {
      const s = await window.nexus.getUserscript(filename);
      setEditing(s);
      setSelected(filename);
      setDirty(false);
    } catch (err) {
      console.error('get userscript failed', err);
    }
  };

  const flashMsg = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  const handleNew = async (type: 'js' | 'css') => {
    const base = `script-${timestampSlug()}`;
    const filename = `${base}.user.${type}`;
    const source = type === 'js' ? JS_TEMPLATE : CSS_TEMPLATE;
    try {
      await window.nexus.saveUserscript(filename, source);
      await refresh();
      await loadInto(filename);
    } catch (err) {
      console.error('create userscript failed', err);
      flashMsg(`Create failed: ${(err as Error).message}`);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      const saved = await window.nexus.saveUserscript(editing.filename, editing.source);
      setEditing(saved);
      setDirty(false);
      flashMsg('Saved.');
    } catch (err) {
      console.error('save failed', err);
      flashMsg(`Save failed: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Delete ${filename}? This cannot be undone.`)) return;
    try {
      await window.nexus.deleteUserscript(filename);
      if (selected === filename) {
        setEditing(null);
        setSelected(null);
        setDirty(false);
      }
      await refresh();
    } catch (err) {
      console.error('delete failed', err);
    }
  };

  const handleToggle = async (filename: string, enabled: boolean) => {
    try {
      await window.nexus.setUserscriptEnabled(filename, enabled);
      await refresh();
      if (selected === filename) await loadInto(filename);
    } catch (err) {
      console.error('toggle failed', err);
    }
  };

  const handleRename = async (filename: string) => {
    const next = window.prompt('New filename (must end in .user.js or .user.css):', filename);
    if (!next || next === filename) return;
    const trimmed = next.trim();
    try {
      const renamed = await window.nexus.renameUserscript(filename, trimmed);
      await refresh();
      if (selected === filename) {
        setSelected(renamed.filename);
        setEditing(renamed);
        setDirty(false);
      }
    } catch (err) {
      console.error('rename failed', err);
      flashMsg(`Rename failed: ${(err as Error).message}`);
    }
  };

  const handleDuplicate = async (filename: string) => {
    try {
      const dup = await window.nexus.duplicateUserscript(filename);
      await refresh();
      await loadInto(dup.filename);
    } catch (err) {
      console.error('duplicate failed', err);
      flashMsg(`Duplicate failed: ${(err as Error).message}`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, filename: string) => {
    e.preventDefault();
    // Clamp to viewport so the menu doesn't clip on right/bottom edge. Width
    // and height are rough; the CSS max-width backs this up.
    const MENU_W = 200;
    const MENU_H = 200;
    const x = Math.min(e.clientX, window.innerWidth - MENU_W - 4);
    const y = Math.min(e.clientY, window.innerHeight - MENU_H - 4);
    setMenu({ filename, x, y });
  };

  const moduleName = (id?: string) =>
    id ? (modules.find((m) => m.manifest.id === id)?.manifest.name ?? id) : 'any';

  const sorted = useMemo(
    () => [...scripts].sort((a, b) => a.meta.name.localeCompare(b.meta.name)),
    [scripts],
  );

  const menuScript = menu ? scripts.find((s) => s.filename === menu.filename) : null;

  return (
    <div className="userscripts-pane">
      <p className="editor-hint">
        Userscripts let you inject JavaScript or CSS into any module. Use a
        Tampermonkey/Stylus-style header block to control which module and URL
        each script runs on. Edit in the box below or in your own editor — the
        files live in your userscripts folder. JS runs in the page's main world;
        no <code>GM_*</code> APIs are provided.
      </p>

      <div className="row-actions">
        <button onClick={() => handleNew('js')}>+ New .user.js</button>
        <button onClick={() => handleNew('css')}>+ New .user.css</button>
        <button onClick={() => window.nexus.openUserscriptsDir()}>
          Open userscripts folder
        </button>
        <button onClick={() => window.nexus.rescanUserscripts().then(refresh)}>
          Rescan
        </button>
        <button onClick={() => window.open(TUTORIAL_URL, '_blank', 'noopener')}>
          Open tutorial
        </button>
      </div>

      <div className="userscripts-layout">
        <ul className="userscripts-list" role="list">
          {sorted.length === 0 && (
            <li className="empty">No userscripts yet. Create one to get started.</li>
          )}
          {sorted.map((s) => (
            <li
              key={s.filename}
              className={`userscripts-item ${selected === s.filename ? 'active' : ''}`}
              onContextMenu={(e) => handleContextMenu(e, s.filename)}
            >
              <button
                className="userscripts-item-main"
                onClick={() => loadInto(s.filename)}
                title={s.filename}
              >
                <div className="userscripts-item-name">
                  <span className={`userscripts-badge ${s.type}`}>{s.type.toUpperCase()}</span>
                  {s.meta.name}
                </div>
                <div className="userscripts-item-meta">
                  {moduleName(s.meta.moduleId)}
                  {s.meta.matches.length > 0 && ` · ${s.meta.matches.length} match${s.meta.matches.length === 1 ? '' : 'es'}`}
                  {s.error && <span className="userscripts-error"> · error</span>}
                </div>
              </button>
              <label className="userscripts-toggle" title={s.enabled ? 'Disable' : 'Enable'}>
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => handleToggle(s.filename, e.target.checked)}
                />
              </label>
            </li>
          ))}
        </ul>

        <div className="userscripts-editor">
          {!editing && (
            <div className="userscripts-empty">
              Select a script on the left, or create a new one.
            </div>
          )}
          {editing && (
            <>
              <div className="userscripts-editor-header">
                <div>
                  <div className="userscripts-editor-filename">{editing.filename}</div>
                  <div className="userscripts-editor-sub">
                    {editing.type.toUpperCase()} · module:{' '}
                    {moduleName(editing.meta.moduleId)} · matches:{' '}
                    {editing.meta.matches.length === 0
                      ? '(none)'
                      : editing.meta.matches.join(', ')}
                    {' · run-at: '}
                    {editing.meta.runAt}
                  </div>
                </div>
                <div className="userscripts-editor-actions">
                  <button onClick={handleSave} disabled={!dirty}>
                    Save
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => handleDelete(editing.filename)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editing.error && (
                <div className="userscripts-editor-error">{editing.error}</div>
              )}
              <textarea
                className="userscripts-textarea"
                spellCheck={false}
                value={editing.source}
                onChange={(e) => {
                  setEditing({ ...editing, source: e.target.value });
                  setDirty(true);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
              {flash && <div className="toggle-flash">{flash}</div>}
            </>
          )}
        </div>
      </div>

      {menu && menuScript && (
        <div
          ref={menuRef}
          className="userscripts-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              loadInto(menu.filename);
            }}
          >
            Open
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              handleRename(menu.filename);
            }}
          >
            Rename…
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              handleDuplicate(menu.filename);
            }}
          >
            Duplicate
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              handleToggle(menu.filename, !menuScript.enabled);
            }}
          >
            {menuScript.enabled ? 'Disable' : 'Enable'}
          </button>
          <div className="userscripts-context-menu-sep" />
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              setMenu(null);
              handleDelete(menu.filename);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
