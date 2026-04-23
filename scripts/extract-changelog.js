#!/usr/bin/env node
// Extracts the changelog section for a given version from CHANGELOG.md and
// prepends the standard macOS first-launch callout, so every GitHub release
// body follows the same shape:
//
//     > macOS first launch: xattr instructions...
//     ---
//     (changelog section for this version)
//
// The callout tells unsigned-Mac users how to get past Gatekeeper's
// "Nexus is damaged" message on first run — easy to miss in the README,
// so we surface it on every release page.
//
// Usage: node scripts/extract-changelog.js 1.1.0
const fs = require('fs');
const path = require('path');

const MAC_CALLOUT =
  '> **macOS first launch**: if you see "Nexus is damaged and can\'t be opened," Nexus is fine — macOS flags every unsigned download that way. Open Terminal once and run `xattr -cr /Applications/Nexus.app`, then relaunch. Details in the [README](https://github.com/Teamingzooper/nexus-client#first-launch).\n\n---\n';

const version = (process.argv[2] || '').replace(/^v/, '');
if (!version) {
  console.error('Usage: extract-changelog.js <version>');
  process.exit(1);
}

const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
let capturing = false;
const out = [];

for (const line of lines) {
  if (/^## /.test(line)) {
    if (capturing) break;
    if (line.includes(version)) capturing = true;
    continue;
  }
  if (capturing) out.push(line);
}

// Trim leading/trailing blank lines
while (out.length && !out[0].trim()) out.shift();
while (out.length && !out[out.length - 1].trim()) out.pop();

if (!out.length) {
  console.error(`No changelog entry found for version ${version}`);
  process.exit(1);
}

process.stdout.write(MAC_CALLOUT + '\n' + out.join('\n') + '\n');
