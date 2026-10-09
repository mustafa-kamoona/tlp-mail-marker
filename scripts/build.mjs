#!/usr/bin/env node
/**
 * Build the extension.
 *
 *   node scripts/build.mjs --target=production   (default) minified, no sourcemap
 *   node scripts/build.mjs --target=development  readable, inline sourcemap
 *   node scripts/build.mjs --target=e2e           development + localhost content
 *                                                  script registration for tests
 */

import { build } from 'esbuild';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const target = args.target ?? 'production';
if (!['production', 'development', 'e2e'].includes(target)) {
  throw new Error(`Unknown target: ${target}`);
}

const browser = args.browser ?? 'chromium';
if (!['chromium', 'firefox'].includes(browser)) {
  throw new Error(`Unknown browser: ${browser}`);
}
const outDir = join(rootDir, `dist${browser === 'firefox' ? '-firefox' : ''}${target === 'e2e' ? '-e2e' : ''}`);
const minify = target === 'production';
const sourcemap = target === 'production' ? false : 'inline';
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const common = {
    bundle: true,
    target: [browser === 'firefox' ? 'firefox140' : 'chrome116'],
    minify,
    sourcemap,
    logLevel: 'info',
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development'),
    },
  };

  await build({
    ...common,
    entryPoints: [join(rootDir, 'src/content/index.ts')],
    outfile: join(outDir, 'content.js'),
    format: 'iife',
  });

  await build({
    ...common,
    entryPoints: [join(rootDir, 'src/content/env-probe.ts')],
    outfile: join(outDir, 'env-probe.js'),
    format: 'iife',
  });

  await build({
    ...common,
    entryPoints: [join(rootDir, 'src/background/service-worker.ts')],
    outfile: join(outDir, 'background.js'),
    format: browser === 'firefox' ? 'iife' : 'esm',
  });

  await build({
    ...common,
    entryPoints: [join(rootDir, 'src/options/options.ts')],
    outfile: join(outDir, 'options.js'),
    format: 'esm',
  });

  await build({
    ...common,
    entryPoints: [join(rootDir, 'src/popup/popup.ts')],
    outfile: join(outDir, 'popup.js'),
    format: 'esm',
  });

  // Static assets
  for (const file of ['options.html', 'options.css', 'popup.html', 'popup.css']) {
    const [page] = file.split('.');
    cpSync(join(rootDir, 'src', page, file), join(outDir, file));
  }

  // Icons
  if (!existsSync(join(rootDir, 'public/icons/icon-128.png'))) {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [join(rootDir, 'scripts/generate-icons.mjs')], { stdio: 'inherit' });
  }
  cpSync(join(rootDir, 'public'), outDir, { recursive: true });

  // Localisation catalogues
  cpSync(join(rootDir, '_locales'), join(outDir, '_locales'), { recursive: true });

  // Manifest
  const manifest = JSON.parse(readFileSync(join(rootDir, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  if (browser === 'firefox') {
    delete manifest.minimum_chrome_version;
    // Firefox MV3 uses a non-persistent background script, not a service worker.
    manifest.background = { scripts: ['background.js'] };
    // Firefox managed storage uses native manifests / 3rdparty policy instead.
    delete manifest.storage;
    manifest.browser_specific_settings = {
      gecko: {
        id: 'tlp-mail-marker@mustafa-kamoona',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      // The same consent manifest key landed later on Android; mobile remains untested.
      gecko_android: { strict_min_version: '142.0' },
    };
  }
  if (target === 'e2e') {
    manifest.content_scripts = [
      {
        matches: [
          'http://localhost/*',
          'https://localhost/*',
          'http://127.0.0.1/*',
          'https://127.0.0.1/*',
        ],
        js: ['content.js'],
        allFrames: true,
        runAt: 'document_idle',
      },
      {
        matches: [
          'http://localhost/*',
          'https://localhost/*',
          'http://127.0.0.1/*',
          'https://127.0.0.1/*',
        ],
        js: ['env-probe.js'],
        allFrames: true,
        runAt: 'document_idle',
        world: 'MAIN',
      },
    ];
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`\nBuilt ${browser} ${target} → ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
