#!/usr/bin/env node
/**
 * Package the built extension for the Chrome Web Store.
 * Produces release/tlp-mail-marker-<version>.zip plus a SHA-256 checksum.
 *
 * Requires `npm run build` to have been run first.
 */

import { createHash } from 'node:crypto';
import { archiveDirectory } from './archive.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const browser = process.argv.includes('--browser=firefox') ? 'firefox' : 'chromium';
const distDir = join(rootDir, browser === 'firefox' ? 'dist-firefox' : 'dist');
const releaseDir = join(rootDir, 'release');
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const zipPath = join(releaseDir, `tlp-mail-marker${browser === 'firefox' ? '-firefox' : ''}-${pkg.version}.zip`);

if (!existsSync(join(distDir, 'manifest.json'))) {
  process.stderr.write(`${distDir}/manifest.json not found. Build first.\n`);
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });

archiveDirectory(distDir, zipPath);

const hash = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
writeFileSync(`${zipPath}.sha256`, `${hash}  ${zipPath.split('/').pop()}\n`);

process.stdout.write(`\nPackaged: ${zipPath}\nSHA-256: ${hash}\n`);
