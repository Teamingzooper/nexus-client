import { z } from 'zod';

export type UserscriptType = 'js' | 'css';
export type RunAt = 'document-end' | 'document-idle';

export interface UserscriptMeta {
  name: string;
  description?: string;
  matches: string[];
  moduleId?: string;
  runAt: RunAt;
}

export interface Userscript {
  /** Filename relative to the userscripts dir, e.g. "dark-whatsapp.user.js". Also the ID. */
  filename: string;
  type: UserscriptType;
  meta: UserscriptMeta;
  source: string;
  enabled: boolean;
  /** Parse/load error, if any. */
  error?: string;
}

/** Userscript without the source body — cheaper payload for list views. */
export type UserscriptSummary = Omit<Userscript, 'source'>;

export const userscriptFilenameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-_. ]*\.user\.(js|css)$/, 'filename must end in .user.js or .user.css');

export const userscriptSaveSchema = z.object({
  filename: userscriptFilenameSchema,
  source: z.string().max(500_000),
});

export const userscriptSetEnabledSchema = z.object({
  filename: userscriptFilenameSchema,
  enabled: z.boolean(),
});

/**
 * Parse a Tampermonkey/Stylus-style header block out of a .user.js or .user.css
 * file. Missing header is not an error — returns defaults with empty matches
 * (so the script won't run until the user adds a @match).
 */
export function parseHeader(source: string, type: UserscriptType, filename: string): UserscriptMeta {
  const open = type === 'css' ? /\/\*\s*==UserStyle==\s*|\/\/\s*==UserScript==/ : /\/\/\s*==UserScript==/;
  const close = type === 'css' ? /==\/UserStyle==\s*\*\/|\/\/\s*==\/UserScript==/ : /\/\/\s*==\/UserScript==/;
  const openMatch = open.exec(source);
  if (!openMatch) {
    return { name: filename, matches: [], runAt: 'document-end' };
  }
  const rest = source.slice(openMatch.index + openMatch[0].length);
  const closeMatch = close.exec(rest);
  const headerBody = closeMatch ? rest.slice(0, closeMatch.index) : rest;

  // Matches "// @key   value" or "@key   value" (for CSS inside /* */ block).
  const lineRe = /(?:^|\n)\s*(?:\/\/)?\s*@([a-zA-Z-]+)[ \t]+([^\n\r]+)/g;
  const matches: string[] = [];
  let name = filename;
  let description: string | undefined;
  let moduleId: string | undefined;
  let runAt: RunAt = 'document-end';
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(headerBody)) !== null) {
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    switch (key) {
      case 'name':
        name = value;
        break;
      case 'description':
        description = value;
        break;
      case 'match':
      case 'include':
        matches.push(value);
        break;
      case 'module':
        moduleId = value;
        break;
      case 'run-at':
        if (value === 'document-idle') runAt = 'document-idle';
        else if (value === 'document-end' || value === 'document-start') runAt = 'document-end';
        break;
    }
  }
  return { name, description, matches, moduleId, runAt };
}

/**
 * Compile a Tampermonkey-style glob pattern into a regex. Supports `*`
 * wildcards anywhere. Example: `https://*.example.com/*` matches
 * `https://web.example.com/anything`.
 */
export function compileMatch(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

export function matchesUrl(pattern: string, url: string): boolean {
  try {
    return compileMatch(pattern).test(url);
  } catch {
    return false;
  }
}
