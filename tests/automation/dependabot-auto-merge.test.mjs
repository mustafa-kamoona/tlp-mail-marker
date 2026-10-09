import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, latestCiRun, mergeIfUnchanged, parseDependencies } from '../../scripts/dependabot-auto-merge.mjs';

const repository = 'mustafa-kamoona/tlp-mail-marker';
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const metadata = type => `Update dependency\n\n---\nupdated-dependencies:\n- dependency-name: example\n  dependency-version: 1.3.0\n  dependency-type: direct:development\n${type ? `  update-type: ${type}\n` : ''}...\n\nSigned-off-by: dependabot[bot]`;
function fixture() {
  return {
    repository, branch: 'main', mainSha: base,
    pr: { number: 1, state: 'open', draft: false, user: { login: 'dependabot[bot]', type: 'Bot' }, base: { ref: 'main', repo: { full_name: repository } }, head: { sha: head, ref: 'dependabot/npm_and_yarn/example', repo: { full_name: repository } } },
    commit: { sha: head, author: { login: 'dependabot[bot]' }, parents: [{ sha: base }], commit: { message: metadata('version-update:semver-minor'), verification: { verified: true, reason: 'valid' } } },
    files: [{ filename: 'package.json', status: 'modified' }, { filename: 'package-lock.json', status: 'modified' }],
    baseLock: { packages: { 'node_modules/example': { version: '1.2.3' } } },
    headLock: { packages: { 'node_modules/example': { version: '1.3.0' } } },
    run: { id: 1, run_attempt: 1, path: '.github/workflows/ci.yml', event: 'pull_request', status: 'completed', conclusion: 'success', head_sha: head, head_branch: 'dependabot/npm_and_yarn/example', head_repository: { full_name: repository }, pull_requests: [{ number: 1, head: { sha: head }, base: { sha: base } }] },
    jobs: ['Typecheck, tests & build', 'Browser E2E (Roundcube)', 'Native E2E (Thunderbird)', 'Native E2E (Thunderbird Windows)', 'Native E2E (Firefox ESR)', 'Native E2E (Firefox Stable)'].map(name => ({ name, status: 'completed', conclusion: 'success' })),
  };
}

test('a verified minor update with all required CI jobs succeeds', () => assert.equal(decide(fixture()).eligible, true));
test('security metadata without update-type uses actual versions', () => {
  const f = fixture(); f.commit.commit.message = metadata();
  assert.equal(decide(f).eligible, true);
  f.headLock.packages['node_modules/example'].version = '2.0.0';
  assert.equal(decide(f).eligible, false);
});
test('a misleading minor group name cannot hide a major version', () => {
  const f = fixture(); f.commit.commit.message = metadata().replace('  dependency-type:', '  dependency-group: npm-security-patch-and-minor\n  dependency-type:');
  f.headLock.packages['node_modules/example'].version = '5.0.3';
  assert.match(decide(f).reason, /Major/);
});

const denied = [
  ['human author', f => { f.pr.user.login = 'mustafa-kamoona'; }],
  ['draft', f => { f.pr.draft = true; }],
  ['fork', f => { f.pr.head.repo.full_name = 'someone/tlp-mail-marker'; }],
  ['wrong target branch', f => { f.pr.base.ref = 'other'; }],
  ['unsigned commit', f => { f.commit.commit.verification.verified = false; }],
  ['modified head after testing', f => { f.pr.head.sha = 'c'.repeat(40); }],
  ['extra parent', f => { f.commit.parents.push({ sha: head }); }],
  ['unknown metadata', f => { f.commit.commit.message = 'Bump patch dependency'; }],
  ['major metadata', f => { f.commit.commit.message = metadata('version-update:semver-major'); }],
  ['application code change', f => { f.files.push({ filename: 'src/core/tlp.ts', status: 'modified' }); }],
  ['added file', f => { f.files[0].status = 'added'; }],
  ['prerelease', f => { f.headLock.packages['node_modules/example'].version = '1.3.0-rc.1'; }],
  ['downgrade', f => { f.headLock.packages['node_modules/example'].version = '1.2.2'; }],
  ['ambiguous indirect versions', f => { f.commit.commit.message = f.commit.commit.message.replace('direct:development', 'indirect'); f.headLock.packages['node_modules/parent/node_modules/example'] = { version: '2.0.0' }; }],
  ['stale base', f => { f.mainSha = 'c'.repeat(40); }],
  ['failed run', f => { f.run.conclusion = 'failure'; }],
  ['wrong workflow', f => { f.run.path = '.github/workflows/other.yml'; }],
  ['push run instead of PR', f => { f.run.event = 'push'; }],
  ['different PR head', f => { f.run.head_sha = 'c'.repeat(40); }],
  ['different tested base', f => { f.run.pull_requests[0].base.sha = 'c'.repeat(40); }],
  ['missing browser job', f => { f.jobs.splice(1, 1); }],
  ['skipped browser job', f => { f.jobs[1].conclusion = 'skipped'; }],
  ['missing Thunderbird job', f => { f.jobs.splice(2, 1); }],
  ['failed Thunderbird job', f => { f.jobs[2].conclusion = 'failure'; }],
  ['missing Windows Thunderbird job', f => { f.jobs.splice(3, 1); }],
  ['failed Windows Thunderbird job', f => { f.jobs[3].conclusion = 'failure'; }],
  ['missing Firefox ESR job', f => { f.jobs.splice(4, 1); }],
  ['failed Firefox ESR job', f => { f.jobs[4].conclusion = 'failure'; }],
  ['missing Firefox stable job', f => { f.jobs.splice(5, 1); }],
  ['failed Firefox stable job', f => { f.jobs[5].conclusion = 'failure'; }],
  ['pending browser job', f => { f.jobs[1].status = 'in_progress'; }],
  ['failed extra job', f => { f.jobs.push({ name: 'Other check', status: 'completed', conclusion: 'failure' }); }],
];
for (const [name, change] of denied) test(`refuses ${name}`, () => {
  const f = fixture(); change(f); assert.equal(decide(f).eligible, false);
});

test('grouped metadata requires every dependency to be minor or patch', () => {
  const f = fixture();
  f.commit.commit.message = f.commit.commit.message.replace('...\n', '- dependency-name: second\n  update-type: version-update:semver-major\n...\n');
  assert.equal(decide(f).eligible, false);
});
test('direct dependencies use their root resolution despite unrelated nested copies', () => {
  const f = fixture();
  f.baseLock.packages['node_modules/parent/node_modules/example'] = { version: '0.2.0' };
  f.headLock.packages['node_modules/parent/node_modules/example'] = { version: '0.2.0' };
  assert.equal(decide(f).eligible, true);
});
test('malformed, duplicate-key and multiple metadata blocks are refused', () => {
  assert.equal(parseDependencies(metadata('version-update:semver-minor').replace('...', '  update-type: version-update:semver-patch\n...')), null);
  assert.equal(parseDependencies(metadata() + '\n' + metadata()), null);
  assert.equal(parseDependencies(metadata().replace('  dependency-version:', '    dependency-version:')), null);
});
test('Actions updates need explicit patch/minor metadata', () => {
  const f = fixture(); f.files = [{ filename: '.github/workflows/ci.yml', status: 'modified' }];
  assert.equal(decide(f).eligible, true);
  f.commit.commit.message = metadata();
  assert.equal(decide(f).eligible, false);
});
test('a newer failed or pending CI run overrides an older pass', () => {
  const pass = fixture().run;
  assert.equal(latestCiRun([pass, { ...pass, id: 2, conclusion: 'failure' }], head).conclusion, 'failure');
  assert.equal(latestCiRun([{ ...pass, id: 2, status: 'in_progress' }, pass], head).status, 'in_progress');
});

test('merge API receives the verified head SHA', async () => {
  const f = fixture(); const writes = [];
  const request = async (path, method, body) => {
    if (method === 'PUT') { writes.push({ path, body }); return { merged: true }; }
    return path.includes('/pulls/') ? f.pr : { object: { sha: base } };
  };
  assert.equal(await mergeIfUnchanged(request, repository, 'main', f.pr, base), true);
  assert.equal(writes[0].body.sha, head);
  assert.equal(writes[0].body.merge_method, 'squash');
});
for (const race of ['head', 'base', 'closed', 'draft']) test(`no merge after ${race} changes`, async () => {
  const f = fixture(); const fresh = structuredClone(f.pr); let writes = 0;
  if (race === 'head') fresh.head.sha = 'c'.repeat(40);
  if (race === 'closed') fresh.state = 'closed';
  if (race === 'draft') fresh.draft = true;
  const request = async (path, method) => {
    if (method === 'PUT') { writes++; return { merged: true }; }
    return path.includes('/pulls/') ? fresh : { object: { sha: race === 'base' ? 'c'.repeat(40) : base } };
  };
  assert.equal(await mergeIfUnchanged(request, repository, 'main', f.pr, base), false);
  assert.equal(writes, 0);
});
