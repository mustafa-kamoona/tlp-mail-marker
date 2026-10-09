#!/usr/bin/env node
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'dist-thunderbird');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const entry of ['background', 'popup', 'options', 'review']) {
  await build({ entryPoints: [join(root, `src/thunderbird/${entry}.ts`)], outfile: join(out, `${entry}.js`),
    bundle: true, format: 'iife', target: ['firefox140'], minify: true, sourcemap: false, legalComments: 'none' });
}
for (const file of ['popup.html', 'options.html', 'review.html', 'ui.css']) cpSync(join(root, 'src/thunderbird', file), join(out, file));
cpSync(join(root, 'public/icons'), join(out, 'icons'), { recursive: true });
cpSync(join(root, '_locales'), join(out, '_locales'), { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, 'src/thunderbird/manifest.json'), 'utf8'));
manifest.version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built Thunderbird → ${out}`);
