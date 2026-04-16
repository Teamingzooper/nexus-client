import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNexus } from '../store';
import { useOverlay } from '../hooks/useOverlay';

interface Command {
  id: string;
  title: string;
  hint?: string;
  icon?: string;
  run: () => void;
}

/**
 * Score a command title against a query using a simple subsequence-aware
 * scorer. Lower = better match. Returns Infinity if no match at all.
 *   - Exact substring beats subsequence
 *   - Earlier match position beats later
 *   - Shorter title beats longer when scores tie
 * Pure, no fuzzy library needed for this small dataset.
 */
function scoreMatch(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) {
    return idx * 2 + (target.length - q.length) * 0.01;
  }
  // Subsequence fallback.
  let ti = 0;
  let firstMatch = -1;
  let gaps = 0;
  for (let qi = 0; qi < q.length; qi += 1) {
    const c = q[qi];
    while (ti < t.length && t[ti] !== c) {
      ti += 1;
      if (firstMatch >= 0) gaps += 1;
    }
    if (ti >= t.length) return Infinity;
    if (firstMatch < 0) firstMatch = ti;
    ti += 1;
  }
  return 100 + firstMatch + gaps * 2;
}

export function CommandPalette() {
  const open = useNexus((s) => s.commandPaletteOpen);
  const close = useNexus((s) => s.closeCommandPalette);

  // Slices we need to build the command list and run actions.
  const instances = useNexus((s) => s.state.instances);
  const modules = useNexus((s) => s.modules);
  const profiles = useNexus((s) => s.profiles);
  const themes = useNexus((s) => s.themes);
  const activateInstance = useNexus((s) => s.activateInstance);
  const openSettings = useNexus((s) => s.openSettings);
  const openAddInstance = useNexus((s) => s.openAddInstance);
  const openAccountManager = useNexus((s) => s.openAccountManager);
  const setTheme = useNexus((s) => s.setTheme);
  const reloadActiveInstance = useNexus((s) => s.reloadActiveInstance);
  const setInstanceMuted = useNexus((s) => s.setInstanceMuted);
  const lockProfile = useNexus((s) => s.lockProfile);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useOverlay(open);

  // Build the full command list from current state. Re-runs whenever
  // any of the source slices change.
  const allCommands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Instances — jump shortcuts
    for (const inst of instances) {
      const mod = modules.find((m) => m.manifest.id === inst.moduleId);
      cmds.push({
        id: `jump:${inst.id}`,
        title: inst.name,
        hint: mod ? `Switch to ${mod.manifest.name}` : 'Switch to instance',
        icon: '➡️',
        run: () => {
          activateInstance(inst.id).catch(() => {});
          close();
        },
      });
      cmds.push({
        id: `mute:${inst.id}`,
        title: inst.muted ? `Unmute ${inst.name}` : `Mute ${inst.name}`,
        hint: inst.muted ? 'Notifications will resume' : 'Suppress notifications',
        icon: inst.muted ? '🔔' : '🔕',
        run: () => {
          setInstanceMuted(inst.id, !inst.muted).catch(() => {});
          close();
        },
      });
    }

    // Profiles
    cmds.push({
      id: 'profile:switch',
      title: 'Switch profile…',
      hint: 'Open the account manager',
      icon: '👤',
      run: () => {
        openAccountManager();
        close();
      },
    });
    cmds.push({
      id: 'profile:lock',
      title: 'Lock profile',
      hint: 'Sign out of this profile',
      icon: '🔒',
      run: () => {
        lockProfile().catch(() => {});
        close();
      },
    });

    // Settings actions
    cmds.push({
      id: 'settings',
      title: 'Open settings',
      hint: '⌘,',
      icon: '⚙️',
      run: () => {
        openSettings();
        close();
      },
    });
    cmds.push({
      id: 'instance:new',
      title: 'New instance…',
      hint: '⌘N — pick a module',
      icon: '➕',
      run: () => {
        openAddInstance();
        close();
      },
    });
    cmds.push({
      id: 'instance:reload',
      title: 'Reload active instance',
      hint: '⌘R',
      icon: '🔄',
      run: () => {
        reloadActiveInstance().catch(() => {});
        close();
      },
    });

    // Themes
    for (const t of themes) {
      cmds.push({
        id: `theme:${t.id}`,
        title: `Theme: ${t.name}`,
        hint: 'Apply this theme',
        icon: '🎨',
        run: () => {
          setTheme(t.id).catch(() => {});
          close();
        },
      });
    }

    return cmds;
  }, [
    instances,
    modules,
    profiles,
    themes,
    activateInstance,
    setInstanceMuted,
    openAccountManager,
    lockProfile,
    openSettings,
    openAddInstance,
    reloadActiveInstance,
    setTheme,
    close,
  ]);

  const filtered = useMemo(() => {
    if (!query) return allCommands.slice(0, 12);
    return allCommands
      .map((c) => ({ c, s: scoreMatch(query, c.title) }))
      .filter((x) => x.s !== Infinity)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12)
      .map((x) => x.c);
  }, [query, allCommands]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // Focus moves to input once mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(filtered.length - 1, s + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) cmd.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, selected, close]);

  if (!open) return null;

  return (
    <div className="modal-backdrop palette-backdrop" onClick={close} role="dialog" aria-modal="true">
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command or instance name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <ul className="palette-list" role="listbox">
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={i === selected}
              className={`palette-item ${i === selected ? 'selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => cmd.run()}
            >
              <span className="palette-icon" aria-hidden="true">
                {cmd.icon ?? '·'}
              </span>
              <span className="palette-title">{cmd.title}</span>
              {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="palette-empty">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
