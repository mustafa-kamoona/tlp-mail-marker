#!/usr/bin/env node
/** Reset generated output directories. */

import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

for (const dir of ['dist', 'dist-e2e', 'dist-firefox', 'dist-firefox-e2e', 'dist-thunderbird', 'release']) {
  rmSync(join(rootDir, dir), { recursive: true, force: true });
}
process.stdout.write('Cleaned browser, Thunderbird and release outputs.\n');
