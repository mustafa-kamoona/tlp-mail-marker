import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const release = join(root, 'release');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const [source, target] of [
  ['BETA-TESTING.md', 'BETA-TESTING.md'], ['COMPATIBILITY.md', 'COMPATIBILITY.md'],
  ['ORGANISATION-PROFILES.md', 'ORGANISATION-PROFILES.md'],
  ['FIREFOX.md', 'FIREFOX.md'],
  ['organisation-profile.example.json', 'organisation-profile.example.json'],
  [`RELEASE-v${pkg.version}.md`, 'RELEASE-NOTES.md'],
]) copyFileSync(join(root, 'docs', source), join(release, target));
const sums = readdirSync(release).filter(file => file !== 'SHA256SUMS' && !file.endsWith('.sha256')).sort()
  .map(file => `${createHash('sha256').update(readFileSync(join(release, file))).digest('hex')}  ${file}`).join('\n');
writeFileSync(join(release, 'SHA256SUMS'), `${sums}\n`);
console.log('Packaged beta instructions, example profile and SHA256SUMS.');
