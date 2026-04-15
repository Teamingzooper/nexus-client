import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}));

import { resolveModuleFile } from '../../src/main/core/security';

describe('resolveModuleFile', () => {
  const moduleDir = '/tmp/nexus-modules/whatsapp';

  it('resolves a safe relative path', () => {
    const result = resolveModuleFile(moduleDir, 'preload.js');
    expect(result).toBe('/tmp/nexus-modules/whatsapp/preload.js');
  });

  it('allows subdirectories', () => {
    const result = resolveModuleFile(moduleDir, 'assets/icon.svg');
    expect(result).toBe('/tmp/nexus-modules/whatsapp/assets/icon.svg');
  });

  it('rejects parent-dir escapes', () => {
    expect(resolveModuleFile(moduleDir, '../escape.js')).toBeNull();
    expect(resolveModuleFile(moduleDir, '../../secret')).toBeNull();
    expect(resolveModuleFile(moduleDir, 'a/../../escape')).toBeNull();
  });

  it('rejects absolute paths', () => {
    expect(resolveModuleFile(moduleDir, '/etc/passwd')).toBeNull();
  });
});
