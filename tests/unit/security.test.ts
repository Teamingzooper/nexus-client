import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}));

import { resolveModuleFile } from '../../src/main/core/security';

describe('resolveModuleFile', () => {
  // Build an absolute path using the platform's own tmpdir so the same test
  // works on macOS, Linux, and Windows. resolveModuleFile internally uses
  // path.resolve / path.relative which emit platform-native separators.
  const moduleDir = path.join(os.tmpdir(), 'nexus-modules', 'whatsapp');

  it('resolves a safe relative path', () => {
    const result = resolveModuleFile(moduleDir, 'preload.js');
    expect(result).toBe(path.join(moduleDir, 'preload.js'));
  });

  it('allows subdirectories', () => {
    const result = resolveModuleFile(moduleDir, 'assets/icon.svg');
    expect(result).toBe(path.join(moduleDir, 'assets', 'icon.svg'));
  });

  it('rejects parent-dir escapes', () => {
    expect(resolveModuleFile(moduleDir, '../escape.js')).toBeNull();
    expect(resolveModuleFile(moduleDir, '../../secret')).toBeNull();
    expect(resolveModuleFile(moduleDir, 'a/../../escape')).toBeNull();
  });

  it('rejects absolute paths', () => {
    // An absolute path outside the module dir — use the platform's root.
    const outside =
      process.platform === 'win32'
        ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
        : '/etc/passwd';
    expect(resolveModuleFile(moduleDir, outside)).toBeNull();
  });
});
