#!/usr/bin/env node
// Extracts the changelog section for a given version from CHANGELOG.md.
// Usage: node scripts/extract-changelog.js 1.1.0
const fs = require('fs');
const path = require('path');

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

process.stdout.write(out.join('\n') + '\n');
