/**
 * Run only from the trusted default branch, with no PR checkout or npm install.
 * Unknown metadata, stale revisions and incomplete CI always require review.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOT = 'dependabot[bot]';
const ALLOWED_TYPES = new Set(['version-update:semver-patch', 'version-update:semver-minor']);
const REQUIRED_JOBS = ['Typecheck, tests & build', 'Browser E2E (Roundcube)', 'Native E2E (Thunderbird)', 'Native E2E (Thunderbird Windows)', 'Native E2E (Firefox ESR)', 'Native E2E (Firefox Stable)'];

export function parseDependencies(message) {
  const blocks = [...message.replaceAll('\r\n', '\n').matchAll(/^---\nupdated-dependencies:\n([\s\S]*?)^\.\.\.[ \t]*$/gm)];
  if (blocks.length !== 1) return null;
  const dependencies = [];
  const allowedKeys = new Set(['dependency-name', 'dependency-version', 'dependency-type', 'update-type', 'dependency-group']);
  for (const line of blocks[0][1].trimEnd().split('\n')) {
    const match = /^(?:- |  )([a-z-]+): (.+)$/.exec(line);
    if (!match || !allowedKeys.has(match[1])) return null;
    if (line.startsWith('- ')) {
      if (match[1] !== 'dependency-name') return null;
      dependencies.push({});
    }
    const dependency = dependencies.at(-1);
    if (!dependency || Object.hasOwn(dependency, match[1])) return null;
    let value = match[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { return null; }
    }
    if (typeof value !== 'string') return null;
    dependency[match[1]] = value;
  }
  return dependencies.length && dependencies.every(d => /^[\w@./-]+$/.test(d['dependency-name']))
    ? dependencies : null;
}

function version(lock, name, direct) {
  // A direct dependency has its own root resolution; unrelated nested copies
  // can legitimately stay on other versions without changing this update.
  const versions = direct ? new Set([lock?.packages?.[`node_modules/${name}`]?.version])
    : new Set(Object.entries(lock?.packages ?? {})
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([, info]) => info.version));
  if (versions.size !== 1) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec([...versions][0] ?? '');
  return match ? match.slice(1).map(Number) : null;
}

export function decide({ repository, branch, pr, commit, files, baseLock, headLock, mainSha, run, jobs }) {
  const deny = reason => ({ eligible: false, reason });
  if (pr.state !== 'open' || pr.draft || pr.user?.login !== BOT || pr.user?.type !== 'Bot') return deny('Not an open Dependabot PR.');
  if (pr.base?.ref !== branch || pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository || !pr.head.ref.startsWith('dependabot/')) return deny('Unexpected repository or branch.');
  if (commit.sha !== pr.head.sha || commit.author?.login !== BOT || commit.commit?.verification?.verified !== true || commit.commit.verification.reason !== 'valid' || commit.parents?.length !== 1) return deny('The head is not a verified Dependabot commit.');
  const dependencies = parseDependencies(commit.commit.message);
  if (!dependencies) return deny('Unknown dependency metadata; review required.');
  if (!files.length || files.some(f => f.status !== 'modified')) return deny('Unexpected file changes; review required.');
  const npm = files.every(f => ['package.json', 'package-lock.json'].includes(f.filename));
  const actions = files.every(f => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f.filename));
  if (!npm && !actions) return deny('Changes extend beyond dependency manifests or Actions workflows.');
  for (const dependency of dependencies) {
    const type = dependency['update-type'];
    if (type && !ALLOWED_TYPES.has(type)) return deny('Major or unrecognized upgrade; review required.');
    if (actions && !ALLOWED_TYPES.has(type)) return deny('Unknown Actions update type; review required.');
    if (npm) {
      // Security-update metadata may omit update-type; check resolved versions too.
      const direct = ['direct:development', 'direct:production'].includes(dependency['dependency-type']);
      const before = version(baseLock, dependency['dependency-name'], direct);
      const after = version(headLock, dependency['dependency-name'], direct);
      if (!before || !after) return deny('Ambiguous or non-stable package versions; review required.');
      if (before[0] !== after[0]) return deny('Major package upgrade; review required.');
      if (after[1] < before[1] || (after[1] === before[1] && after[2] <= before[2])) return deny('Not a forward patch/minor package update.');
    }
  }
  if (commit.parents[0].sha !== mainSha) return deny('PR needs a rebase and fresh CI against the current default branch.');
  if (!run || run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== pr.head.sha || run.head_branch !== pr.head.ref || run.head_repository?.full_name !== repository) return deny('No successful CI run for this exact PR head.');
  if (!run.pull_requests?.some(p => p.number === pr.number && p.head.sha === pr.head.sha && p.base.sha === mainSha)) return deny('CI did not cover this PR and current base revision.');
  if (!REQUIRED_JOBS.every(name => jobs.some(j => j.name === name && j.status === 'completed' && j.conclusion === 'success')) || jobs.some(j => j.status !== 'completed' || j.conclusion !== 'success')) return deny('Required CI jobs have not all succeeded.');
  return { eligible: true, reason: 'Verified patch/minor update with current build and browser CI.' };
}

export function latestCiRun(runs, headSha) {
  return runs.filter(r => r.path === '.github/workflows/ci.yml' && r.event === 'pull_request' && r.head_sha === headSha)
    .sort((a, b) => b.id - a.id)[0];
}

export async function mergeIfUnchanged(request, repository, branch, pr, mainSha) {
  // The merge endpoint atomically refuses a different PR head SHA.
  const current = await request(`repos/${repository}/pulls/${pr.number}`);
  const base = await request(`repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (current.state !== 'open' || current.draft || current.user?.login !== BOT || current.head.sha !== pr.head.sha || current.base.ref !== branch || base.object.sha !== mainSha) return false;
  const result = await request(`repos/${repository}/pulls/${pr.number}/merge`, 'PUT', {
    sha: pr.head.sha,
    merge_method: 'squash',
    commit_title: `Update dependencies (#${pr.number})`,
    commit_message: 'Verified Dependabot patch/minor updates; build and browser CI passed.',
  });
  return result.merged === true;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token) throw new Error('GitHub repository and token are required.');
  const dryRun = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub API ${method} failed with status ${response.status}.`);
    return response.status === 204 ? null : response.json();
  };
  const pages = async (path, key) => {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const result = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = key ? result[key] : result;
      if (!Array.isArray(items)) throw new Error('Unexpected GitHub pagination response.');
      all.push(...items);
      if (items.length < 100) return all;
    }
    throw new Error('Pagination limit reached; refusing an incomplete decision.');
  };
  const lockAt = async sha => {
    const file = await request(`repos/${repository}/contents/package-lock.json?ref=${sha}`);
    if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 1_000_000) throw new Error('Unsupported lockfile response.');
    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  };
  const repo = await request(`repos/${repository}`);
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const triggeredRun = event.workflow_run?.id
    ? await request(`repos/${repository}/actions/runs/${event.workflow_run.id}`) : null;
  const prs = await pages(`repos/${repository}/pulls?state=open&base=${encodeURIComponent(repo.default_branch)}`);
  for (const summary of prs) {
    if (summary.user?.login !== BOT) continue;
    const pr = await request(`repos/${repository}/pulls/${summary.number}`);
    if (triggeredRun && triggeredRun.head_sha !== pr.head.sha) continue;
    const commits = await pages(`repos/${repository}/pulls/${pr.number}/commits`);
    if (commits.length !== 1) { console.log(`#${pr.number}: multiple commits; review required.`); continue; }
    const commit = commits[0];
    const files = await pages(`repos/${repository}/pulls/${pr.number}/files`);
    const npm = files.every(f => ['package.json', 'package-lock.json'].includes(f.filename));
    let baseLock, headLock;
    if (npm && commit.parents?.length === 1) [baseLock, headLock] = await Promise.all([lockAt(commit.parents[0].sha), lockAt(pr.head.sha)]);
    const base = await request(`repos/${repository}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
    const runs = await pages(`repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}`, 'workflow_runs');
    // A newer pending/failed run must not be hidden by an older successful run.
    const run = latestCiRun(runs, pr.head.sha);
    const jobs = run ? await pages(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs') : [];
    const decision = decide({ repository, branch: repo.default_branch, pr, commit, files, baseLock, headLock, mainSha: base.object.sha, run, jobs });
    console.log(`#${pr.number}: ${decision.reason}`);
    if (!decision.eligible || dryRun) continue;
    if (await mergeIfUnchanged(request, repository, repo.default_branch, pr, base.object.sha)) {
      console.log(`#${pr.number}: merged.`);
      // GITHUB_TOKEN merges do not trigger push workflows; explicitly verify main.
      await request(`repos/${repository}/actions/workflows/ci.yml/dispatches`, 'POST', { ref: repo.default_branch });
    } else console.log(`#${pr.number}: state changed; not merged.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
