#!/usr/bin/env node
/* eslint-disable */
/**
 * Builds latest-mac.yml or latest.yml from the artifacts in `release/`,
 * the same shape electron-updater expects on a GitHub release. We
 * write this ourselves (instead of using `electron-builder --publish always`)
 * because that command also publishes blockmaps and other files we don't
 * want on the release page.
 *
 * Output format (matches electron-builder's published manifest):
 *
 *   version: 1.2.3
 *   files:
 *     - url: Nexus-1.2.3-arm64.dmg
 *       sha512: <base64>
 *       size: 96123456
 *   path: Nexus-1.2.3-arm64.dmg
 *   sha512: <base64>
 *   releaseDate: 2026-04-16T00:00:00.000Z
 *
 * Usage:  node scripts/build-updater-yml.js mac
 *         node scripts/build-updater-yml.js win
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const target = process.argv[2];
if (target !== 'mac' && target !== 'win') {
  console.error('usage: build-updater-yml.js mac|win');
  process.exit(2);
}

const releaseDir = path.resolve(__dirname, '..', 'release');
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
);
const version = pkg.version;

function sha512(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha512').update(data).digest('base64');
}

function fileEntry(name) {
  const full = path.join(releaseDir, name);
  const stat = fs.statSync(full);
  return {
    url: name,
    sha512: sha512(full),
    size: stat.size,
  };
}

function listExt(ext) {
  return fs
    .readdirSync(releaseDir)
    .filter((f) => f.endsWith(ext))
    .filter((f) => !f.endsWith('.blockmap'))
    .sort();
}

function yamlForMac() {
  // electron-updater for mac reads from the .zip listed first, but we list
  // both DMG and ZIP files so users can grab either from the release page.
  const zips = listExt('.zip');
  const dmgs = listExt('.dmg');
  if (zips.length === 0) throw new Error('no mac zips found in release/');

  const fileEntries = [
    ...zips.map(fileEntry),
    ...dmgs.map(fileEntry),
  ];
  // path: refers to the primary artifact electron-updater downloads (zip).
  const primary = zips[0];
  const primaryEntry = fileEntries.find((e) => e.url === primary);
  return {
    version,
    files: fileEntries,
    path: primary,
    sha512: primaryEntry.sha512,
    releaseDate: new Date().toISOString(),
  };
}

function yamlForWin() {
  const exes = listExt('.exe');
  if (exes.length === 0) throw new Error('no .exe found in release/');
  const fileEntries = exes.map(fileEntry);
  const primary = exes[0];
  const primaryEntry = fileEntries.find((e) => e.url === primary);
  return {
    version,
    files: fileEntries,
    path: primary,
    sha512: primaryEntry.sha512,
    releaseDate: new Date().toISOString(),
  };
}

function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(obj)) {
    return obj.map((item) => `${pad}-\n${toYaml(item, indent + 1)}`).join('');
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj)
      .map(([k, v]) => {
        if (Array.isArray(v) || (v && typeof v === 'object')) {
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
        }
        if (typeof v === 'string') {
          return `${pad}${k}: ${v}\n`;
        }
        return `${pad}${k}: ${v}\n`;
      })
      .join('');
  }
  return `${pad}${obj}\n`;
}

const manifest = target === 'mac' ? yamlForMac() : yamlForWin();
const yaml = toYaml(manifest);
const outName = target === 'mac' ? 'latest-mac.yml' : 'latest.yml';
const outPath = path.join(releaseDir, outName);
fs.writeFileSync(outPath, yaml, 'utf8');
console.log(`wrote ${outPath}`);
console.log(yaml);
