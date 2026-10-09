#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { archiveDirectory } from './archive.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist-thunderbird');
if (!existsSync(join(dist, 'manifest.json'))) throw new Error('Run npm run build:thunderbird first.');
const version = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version;
const file = `tlp-mail-marker-thunderbird-${version}.xpi`;
const archive = join(root, 'release', file);
mkdirSync(join(root, 'release'), { recursive: true }); rmSync(archive, { force: true });
archiveDirectory(dist, archive);
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${digest}  ${file}\n`);
console.log(`Packaged ${archive}\nSHA-256: ${digest}`);
