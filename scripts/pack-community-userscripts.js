#!/usr/bin/env node
/* eslint-disable */
/**
 * Package every .user.js / .user.css file under community-userscripts/ for
 * release. Unlike community-modules/ — where each module is a multi-file
 * folder that ships as a zip — a userscript is always a single file, so the
 * files are copied as-is into community-userscripts/dist/ and an index.json
 * manifest is written alongside listing them with the metadata parsed out
 * of each header block.
 *
 * Outputs:
 *   community-userscripts/dist/<name>.user.js
 *   community-userscripts/dist/<name>.user.css
 *   community-userscripts/dist/index.json
 *
 * The in-app browser downloads index.json to list available scripts and
 * fetches an individual <name>.user.{js,css} file when the user clicks
 * Install. No zipping needed.
 *
 * Usage:  node scripts/pack-community-userscripts.js
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'community-userscripts');
const outDir = path.join(srcDir, 'dist');

if (!fs.existsSync(srcDir)) {
  console.error(`community-userscripts directory not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const entries = fs
  .readdirSync(srcDir, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.user\.(js|css)$/i.test(e.name));

if (entries.length === 0) {
  console.error('no .user.js or .user.css files found under community-userscripts/');
  process.exit(1);
}

const index = [];
for (const entry of entries) {
  const src = path.join(srcDir, entry.name);
  const dst = path.join(outDir, entry.name);
  const source = fs.readFileSync(src, 'utf8');
  const type = entry.name.toLowerCase().endsWith('.css') ? 'css' : 'js';
  const meta = parseHeader(source, type, entry.name);
  // Require @name + at least one @match. @module is optional — cross-service
  // scripts like an auto-sign-in helper legitimately have no module scope.
  if (!meta.name || meta.matches.length === 0) {
    console.error(
      `skipping ${entry.name}: missing required @name or @match header(s)`,
    );
    continue;
  }
  fs.copyFileSync(src, dst);
  index.push({
    filename: entry.name,
    type,
    name: meta.name,
    description: meta.description ?? null,
    author: meta.author ?? null,
    version: meta.version ?? null,
    module: meta.module ?? null,
    matches: meta.matches,
    runAt: meta.runAt,
  });
  console.log(`packed ${entry.name}`);
}

const indexPath = path.join(outDir, 'index.json');
fs.writeFileSync(
  indexPath,
  JSON.stringify({ version: 1, scripts: index }, null, 2),
  'utf8',
);
console.log(`wrote ${indexPath}`);

/**
 * Minimal header parser — matches the logic in src/shared/userscripts.ts but
 * kept standalone here so the release workflow doesn't depend on a TS build.
 */
function parseHeader(source, type, filename) {
  const openRe =
    type === 'css'
      ? /\/\*\s*==UserStyle==\s*|\/\/\s*==UserScript==/
      : /\/\/\s*==UserScript==/;
  const closeRe =
    type === 'css'
      ? /==\/UserStyle==\s*\*\/|\/\/\s*==\/UserScript==/
      : /\/\/\s*==\/UserScript==/;
  const open = openRe.exec(source);
  if (!open) return { name: filename, matches: [], runAt: 'document-end' };
  const rest = source.slice(open.index + open[0].length);
  const close = closeRe.exec(rest);
  const headerBody = close ? rest.slice(0, close.index) : rest;

  const lineRe = /(?:^|\n)\s*(?:\/\/)?\s*@([a-zA-Z-]+)[ \t]+([^\n\r]+)/g;
  const out = {
    name: undefined,
    description: undefined,
    author: undefined,
    version: undefined,
    module: undefined,
    matches: [],
    runAt: 'document-end',
  };
  let m;
  while ((m = lineRe.exec(headerBody))) {
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    switch (key) {
      case 'name':
        out.name = value;
        break;
      case 'description':
        out.description = value;
        break;
      case 'author':
        out.author = value;
        break;
      case 'version':
        out.version = value;
        break;
      case 'module':
        out.module = value;
        break;
      case 'match':
      case 'include':
        out.matches.push(value);
        break;
      case 'run-at':
        if (value === 'document-idle') out.runAt = 'document-idle';
        else out.runAt = 'document-end';
        break;
    }
  }
  return out;
}
