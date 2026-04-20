#!/usr/bin/env node
/* eslint-disable */
/**
 * Package every top-level folder under community-modules/ into its own .zip.
 * Each zip contains the module folder at its root so that unzipping into a
 * user's modules directory produces a valid module layout.
 *
 * Outputs go to community-modules/dist/<module-id>.zip. Used by the
 * "Community modules" release workflow and the in-app browser (which
 * downloads the zips attached to the corresponding GitHub release).
 *
 * Uses `zip -r` from the system so we don't pull in an archive library. On
 * the GitHub Actions runners (ubuntu-latest / macos-latest) `zip` is
 * preinstalled; on Windows runners we shell out to PowerShell's
 * Compress-Archive for the same effect.
 *
 * Usage:  node scripts/pack-community-modules.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'community-modules');
const outDir = path.join(srcDir, 'dist');

if (!fs.existsSync(srcDir)) {
  console.error(`community-modules directory not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const entries = fs
  .readdirSync(srcDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'dist');

if (entries.length === 0) {
  console.error('no modules found under community-modules/');
  process.exit(1);
}

const manifestIndex = [];

for (const entry of entries) {
  const moduleDir = path.join(srcDir, entry.name);
  const manifestPath = path.join(moduleDir, 'nexus-module.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`skipping ${entry.name}: no nexus-module.json`);
    continue;
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    console.error(`invalid JSON in ${entry.name}/nexus-module.json:`, err.message);
    process.exit(1);
  }

  const zipName = `${manifest.id}.zip`;
  const zipPath = path.join(outDir, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  packModule(moduleDir, zipPath);

  manifestIndex.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author ?? null,
    description: manifest.description ?? null,
    url: manifest.url,
    zip: zipName,
  });
  console.log(`packed ${manifest.id} → ${zipPath}`);
}

// Write a manifest so the in-app browser can list available modules with a
// single fetch instead of one HEAD per candidate zip.
const indexPath = path.join(outDir, 'index.json');
fs.writeFileSync(
  indexPath,
  JSON.stringify({ version: 1, modules: manifestIndex }, null, 2),
  'utf8',
);
console.log(`wrote ${indexPath}`);

function packModule(moduleDir, zipPath) {
  // On Windows, fall back to PowerShell. Otherwise use system `zip`.
  if (process.platform === 'win32') {
    // Compress-Archive refuses to overwrite with -Force missing on old PS;
    // we already deleted the target above so -Force here is belt-and-braces.
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path "${moduleDir}\\*" -DestinationPath "${zipPath}" -Force`,
      ],
      { stdio: 'inherit' },
    );
    return;
  }
  // Zip the contents of moduleDir so the archive root IS the module folder.
  // -r recursive, -q quiet, -j would junk paths (we want them kept).
  const parent = path.dirname(moduleDir);
  const base = path.basename(moduleDir);
  execFileSync('zip', ['-r', '-q', zipPath, base], {
    cwd: parent,
    stdio: 'inherit',
  });
}
