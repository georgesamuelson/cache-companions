// Local-only regressions: real Git inspection/scanning, mocked GitHub responses; no keys or network.
// Run: node --test .github/ci/referee.test.mjs (requires the scanner's git, jq and gitleaks).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url));
const m = await import(pathToFileURL(process.env.REFEREE_MODULE || join(here, 'referee.mjs')));
const root = process.env.REFEREE_TEST_DIR || mkdtempSync(join(tmpdir(), 'referee-behind-'));
const source = join(root, 'source'), bin = join(root, 'bin');
const env = { PATH: process.env.PATH, HOME: process.env.HOME, ORCH_WORKER: process.env.ORCH_WORKER,
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Synthetic fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const repo = 'owner/repo', now = Date.parse('2026-10-31T12:00:00Z');
let old, main, newer, head, attack, workflow, fresh, counter = 0;
function git(args, input) {
  const r = spawnSync('git', args, { cwd: source, env, input, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
function node(base, path, text, parents = [base]) {
  git(['read-tree', base]); const blob = git(['hash-object', '-w', '--stdin'], text);
  git(['update-index', '--add', '--cacheinfo', '100644', blob, path]);
  return git(['commit-tree', git(['write-tree']), ...parents.flatMap(p => ['-p', p]), '-m', 'synthetic fixture']);
}
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
before(() => {
  mkdirSync(source, { recursive: true }); mkdirSync(bin);
  git(['init', '-q', '--initial-branch=main']);
  mkdirSync(join(source, '.github/ci'), { recursive: true });
  copyFileSync(join(here, 'push-rules.sh'), join(source, '.github/ci/push-rules.sh'));
  writeFileSync(join(source, '.github/governance-paths'), '.github/*\nAGENTS.md\n');
  writeFileSync(join(source, '.github/ci/routine-paths'), '*\n');
  writeFileSync(join(source, '.gitleaks.toml'), 'title="Synthetic fixture"\n[[rules]]\nid="synthetic"\nregex="ONLY_SYNTHETIC_CANARY_1234567890"\n');
  git(['add', '.']); old = git(['commit-tree', git(['write-tree']), '-m', 'old main']);
  main = node(old, '.github/main-only.md', 'main moved\n');
  newer = node(main, 'docs/another.md', 'main moved again\n');
  head = node(old, 'docs/notes.md', 'branch note\n');
  fresh = node(main, 'docs/fresh.md', 'fresh branch note\n');
  workflow = node(old, '.github/workflows/fixture.yml', 'name: fixture\n');
  attack = node(old, 'docs/notes.md', 'attack discards main governance\n', [old, main]);
  git(['update-ref', 'refs/heads/main', main]); git(['checkout', '-q', '--detach', main]);
  for (const [number, sha] of [[7, head], [8, attack], [9, workflow], [10, fresh]]) git(['update-ref', `refs/pull/${number}/head`, sha]);
  const realGit = spawnSync('which', ['git'], { env, encoding: 'utf8' }).stdout.trim(); assert(realGit);
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nPATH="\u0024{PATH#${bin}:}"\nexport PATH\nif [ "\u00241" = remote ] && [ "\u00242" = add ] && [ "\u00243" = origin ]; then exec ${quote(realGit)} remote add origin ${quote(source)}; fi\nexec ${quote(realGit)} "\u0024@"\n`);
  chmodSync(join(bin, 'git'), 0o700);
});
after(() => { if (!process.env.REFEREE_TEST_DIR) rmSync(root, { recursive: true, force: true }); });
const inspectEnv = () => ({ ...env, PATH: bin + ':' + env.PATH });
function pr(sha = head, number = 7, base = old) {
  return { number, node_id: 'PR_' + number, state: 'open', draft: false, labels: [],
    head: { sha, ref: 'feature', repo: { full_name: repo } }, base: { sha: base, ref: 'main', repo: { full_name: repo } } };
}
function inspect(p) { const d = join(root, 'inspect-' + counter++); mkdirSync(d); return m.inspectGit(p, source, d, inspectEnv()); }
function approval(p) {
  return [{ user: { type: 'Bot' }, performed_via_github_app: { id: 5552138 }, body: m.promptFor(p), created_at: '2026-10-31T10:01:00Z', updated_at: '2026-10-31T10:01:00Z' },
    { user: { login: 'georgesamuelson', type: 'User' }, performed_via_github_app: null, body: 'go', created_at: '2026-10-31T10:02:00Z', updated_at: '2026-10-31T10:02:00Z' }];
}
const activity = p => [{ activity_type: 'push', ref: 'refs/heads/feature', after: p.head.sha, timestamp: '2026-10-31T10:00:00Z' }];
async function exercise(p, opts = {}) {
  const calls = [];
  const api = new m.Api(async (url, init) => {
    const path = new URL(url).pathname, body = init.body && JSON.parse(init.body); calls.push({ path, method: init.method, body, authorization: init.headers.Authorization });
    let value;
    if (path.endsWith('/check-runs')) value = { id: 1 };
    else if (path.endsWith('/check-runs/1')) value = {};
    else if (path.endsWith('/events')) value = [];
    else if (path.endsWith('/comments')) value = init.method === 'GET' ? (opts.go ? approval(opts.approved || p) : []) : {};
    else if (path.endsWith('/activity')) value = activity(p);
    else if (path.endsWith('/pulls/' + p.number)) value = opts.refresh || p;
    else if (path.endsWith('/git/ref/heads/main')) {
      if (opts.mainStatus) return new Response('{}', { status: opts.mainStatus });
      value = Object.hasOwn(opts, 'mainResponse') ? opts.mainResponse : { object: { sha: opts.mainTip || main } };
    }
    else if (path.endsWith('/merge')) {
      if (opts.status) return new Response(opts.errorBody ?? JSON.stringify({ message: 'Required checks are pending' }), { status: opts.status });
      value = { merged: true };
    } else throw Error('Unexpected fixture request: ' + path);
    return new Response(JSON.stringify(value), { status: 200 });
  });
  let result, error;
  try { result = await m.processPR(api, p, { repo, read: 'fixture-read', judge: 'fixture-judge', ace: 'fixture-ace', aceId: 5552138,
    allowAutoMerge: false, wall: true, goEnabled: true, now, trusted: source, env: inspectEnv(), patterns: ['.github/*', 'AGENTS.md'], routine: ['*'],
    ...(opts.synthetic ? { inspect: async () => ({ changes: [{ path: 'docs/notes.md', mode: '100644' }], scan: opts.scan ?? 0, main }) } : {}) }); }
  catch (e) { error = e; }
  return { result, error, calls, merges: calls.filter(c => c.method === 'PUT'), check: calls.filter(c => c.body?.conclusion).at(-1)?.body };
}

test('behind-main inventory contains only PR commits and records fetched main', () => {
  const x = inspect(pr()); assert.equal(x.main, main); assert.equal(x.mergeBase, old); assert.equal(x.scan, 0);
  assert.deepEqual(x.changes.map(c => [c.commit, c.path]), [[head, 'docs/notes.md']]);
});
test('stored base predates commits already on main; range and merge base use fetched main', () => {
  const x = inspect(pr(fresh, 10, old)); assert.equal(x.mergeBase, main);
  assert.deepEqual(x.changes.map(c => [c.commit, c.path]), [[fresh, 'docs/fresh.md']]);
});
test('behind-main routine PR passes and requests an exact-head squash', async () => {
  const x = await exercise(pr()); assert.ifError(x.error); assert.equal(x.result.success, true);
  assert.equal(x.check.conclusion, 'success'); assert.deepEqual(x.merges.map(c => c.body), [{ sha: head, merge_method: 'squash' }]);
});
test('current-main routine control remains mergeable', async () => {
  const x = await exercise(pr(fresh, 10, main)); assert.ifError(x.error); assert.equal(x.result.merge, true);
});
test('stale-base commit-tree attack reaches the unchanged merge hard guard', () => {
  assert.throws(() => inspect(pr(attack, 8)), /Merge commit in PR range/);
});
test('commit-tree attack stays red with no merge even with go', async () => {
  const x = await exercise(pr(attack, 8), { go: true }); assert(x.error); assert.equal(x.check.conclusion, 'failure'); assert.equal(x.merges.length, 0);
});
test('trusted checkout must equal fetched main', () => {
  git(['update-ref', 'refs/heads/main', newer]);
  try { assert.throws(() => inspect(pr(fresh, 10, main)), /Trusted main snapshot changed/); }
  finally { git(['update-ref', 'refs/heads/main', main]); }
});
test('fetched head must still match inspected PR', () => {
  assert.throws(() => inspect(pr('a'.repeat(40), 10, main)), /Refs moved during fetch/);
});
test('go approves head only; moving main does not invalidate it', () => {
  const p = pr(), moved = pr(head, 7, main);
  assert.equal(m.countedGo(moved, approval(p), activity(p), 5552138, true, now), true);
  assert.equal(m.promptFor(p), m.promptFor(moved)); assert(!m.promptFor(p).includes(old));
});
test('new head still invalidates go even with a matching push record', () => {
  const p = pr(), changed = pr(fresh, 10, main);
  assert.equal(m.countedGo(changed, approval(p), activity(changed), 5552138, true, now), false);
});
test('workflow go survives main/base movement and names inspected main for hand merge', async () => {
  const p = pr(workflow, 9), moved = pr(workflow, 9, newer);
  const x = await exercise(p, { go: true, refresh: moved }); assert.ifError(x.error);
  assert.equal(x.result.success, true); assert.equal(x.merges.length, 0); assert(x.check.output.summary.includes(main));
});
test('base-only refresh does not stop routine merge', async () => {
  const x = await exercise(pr(), { refresh: pr(head, 7, newer), synthetic: true }); assert.ifError(x.error); assert.equal(x.result.merge, true);
});
test('routine check note names the inspected main tip', async () => {
  const x = await exercise(pr(), { synthetic: true }); assert(x.check.output.summary.includes(main));
});
for (const status of [405, 409]) test(`merge ${status} becomes red with GitHub reason and retry advice`, async () => {
  const x = await exercise(pr(), { synthetic: true, status }); assert.ifError(x.error);
  assert.deepEqual([x.result.success, x.result.merge, x.check.conclusion], [false, false, 'failure']);
  assert.equal(x.check.output.title, 'GitHub refused the merge: Required checks are pending; push or update to retry');
  assert(x.check.output.summary.includes(main)); assert.equal(x.merges.length, 1);
});
for (const errorBody of ['{bad JSON', '{"message":{}}']) test('unreadable refusal reason still gives a red check: ' + errorBody, async () => {
  const x = await exercise(pr(), { synthetic: true, status: 405, errorBody }); assert.ifError(x.error);
  assert.equal(x.check.conclusion, 'failure'); assert.match(x.check.output.title, /GitHub refused the merge: GitHub request failed \(405\); push or update to retry/);
});
test('other merge API errors remain failed inspections', async () => {
  const x = await exercise(pr(), { synthetic: true, status: 500 }); assert(x.error); assert.equal(x.check.conclusion, 'failure');
});
test('desired ruleset permits behind-main branches', () => {
  const walls = JSON.parse(readFileSync(resolve(here, '../walls.json')));
  assert.equal(walls['main-wall'].rules.find(r => r.type === 'required_status_checks').parameters.strict_required_status_checks_policy, false);
});

for (const held of [false, true]) test('main moved before Ace merge stays red, held=' + held, async () => {
  const p = pr(); if (held) p.labels = [{ name: 'hold' }];
  const x = await exercise(p, { synthetic: true, mainTip: newer, go: held }); assert.ifError(x.error);
  assert.deepEqual([x.result.success, x.result.merge, x.check.conclusion, x.merges.length], [false, false, 'failure', 0]);
  assert.equal(x.check.output.title, `main moved since inspection (${main} -> ${newer}); re-checking`);
});
test('main ref is read with read credential immediately before exact-head merge', async () => {
  const x = await exercise(pr(), { synthetic: true }); assert.ifError(x.error);
  const i = x.calls.findIndex(c => c.method === 'PUT'); assert(i > 0);
  assert.equal(x.calls[i - 1].path, '/repos/' + repo + '/git/ref/heads/main');
  assert.equal(x.calls[i - 1].method, 'GET'); assert.equal(x.calls[i - 1].authorization, 'Bearer fixture-read');
  assert.equal(x.calls[i].authorization, 'Bearer fixture-ace'); assert.equal(x.result.merge, true);
});
for (const opts of [{ mainResponse: {} }, { mainResponse: { object: { sha: 'bad' } } }, { mainStatus: 503 }]) test('unreadable main fails closed: ' + JSON.stringify(opts), async () => {
  const x = await exercise(pr(), { synthetic: true, ...opts });
  assert(x.error); assert.equal(x.check.conclusion, 'failure'); assert.equal(x.merges.length, 0);
});
for (const status of [405, 409]) test('refusal message is capped at 300 characters: ' + status, async () => {
  const x = await exercise(pr(), { synthetic: true, status, errorBody: JSON.stringify({ message: 'x'.repeat(2000) }) });
  assert.ifError(x.error); assert.equal(x.check.conclusion, 'failure');
  assert.equal(x.check.output.title, 'GitHub refused the merge: ' + 'x'.repeat(300) + '; push or update to retry');
});
function workflowConfig() {
  const r = spawnSync('ruby', ['-ryaml', '-rjson', '-e', 'd=YAML.safe_load(File.read(ARGV[0]));d["on"]=d.delete(true) if d.key?(true);puts JSON.generate(d)', process.env.REFEREE_WORKFLOW || resolve(here, '../workflows/referee.yml')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
test('main pushes use the existing admitted sweep job', () => {
  const wf = workflowConfig(); assert.deepEqual(wf.on.push, { branches: ['main'] }); assert.deepEqual(Object.keys(wf.jobs), ['inspect']);
  assert.equal(wf.on.schedule[0].cron, '7 */6 * * *');
  const g = { event_name: 'push', event: { ref: 'refs/heads/main' } };
  assert.equal(Function('github', 'return (' + wf.jobs.inspect.if + ')')(g), true);
});
test('main push sweep reloads governed paths and replaces stale routine green', async () => {
  const p = pr(), originalPatterns = readFileSync(join(source, '.github/governance-paths'), 'utf8').trim().split('\n');
  assert.equal(m.classify(inspect(p).changes, originalPatterns, false, ['*']).kind, 'routine');
  const policyMain = node(main, '.github/governance-paths', '.github/*\nAGENTS.md\ndocs/*\n');
  const calls = []; let check = { conclusion: 'success' }, sweeps = 0, inProgress = 0;
  const priorFetch = globalThis.fetch;
  try {
    git(['update-ref', 'refs/heads/main', policyMain]); git(['checkout', '-q', '-f', '--detach', policyMain]);
    const event = join(root, 'push-event.json'); writeFileSync(event, JSON.stringify({ ref: 'refs/heads/main', after: policyMain }));
    const code = readFileSync(process.env.REFEREE_MODULE || join(here, 'referee.mjs'), 'utf8').replace(/async function installation\([\s\S]*?(?=function command\()/, 'async function installation(api, name) { return name; }\n');
    const runner = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname, body = init.body && JSON.parse(init.body); calls.push({ path, method: init.method, body }); let value;
      if (path === '/repos/' + repo) value = { default_branch: 'main', allow_auto_merge: false };
      else if (path.endsWith('/pulls')) { sweeps++; value = [p]; }
      else if (path.endsWith('/pulls/7')) value = p;
      else if (path.endsWith('/events') || path.endsWith('/comments')) value = [];
      else if (path.endsWith('/check-runs') && init.method === 'POST') { inProgress++; check = body; value = { id: 1 }; }
      else if (path.endsWith('/check-runs/1')) { check = body; value = {}; }
      else if (path.endsWith('/git/ref/heads/main')) value = { object: { sha: policyMain } };
      else if (path.endsWith('/merge')) value = { merged: true };
      else if (path === '/installation/token') return new Response(null, { status: 204 });
      else throw Error('Unexpected sweep request: ' + path);
      return Response.json(value);
    };
    if (workflowConfig().on.push?.branches.includes('main')) await runner.main({ ...inspectEnv(), GITHUB_REPOSITORY: repo,
      GITHUB_SERVER_URL: 'https://github.com', GH_TOKEN: 'fixture', TRUSTED_DIR: source, GITHUB_EVENT_PATH: event,
      MAIN_WALL_VERIFIED: 'true', GO_COUNTING_ENABLED: 'false', ACE_APP_ID: '5552138' });
    assert.equal(check.conclusion, 'failure'); assert.equal(sweeps, 1); assert.equal(inProgress, 1);
    assert.match(check.output.title, /waiting for George/); assert(check.output.summary.includes(policyMain));
    assert.equal(calls.filter(c => c.method === 'PUT').length, 0);
  } finally {
    globalThis.fetch = priorFetch; git(['update-ref', 'refs/heads/main', main]); git(['checkout', '-q', '-f', '--detach', main]);
  }
});

for (const [setting, wall] of [[false, true], [true, true], [undefined, true], [false, false]]) test(`auto-merge setting uses Ace metadata: ${setting}, wall=${wall}`, async () => {
  const p = pr(), calls = [], priorFetch = globalThis.fetch;
  const event = join(root, 'metadata-event.json'); writeFileSync(event, JSON.stringify({ pull_request: { number: p.number } }));
  const code = readFileSync(process.env.REFEREE_MODULE || join(here, 'referee.mjs'), 'utf8').replace(/async function installation\([\s\S]*?(?=function command\()/,
    'async function installation(api, name) { return api.request("/fixture-install/" + name, "fixture", "POST"); }\n');
  const runner = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  try {
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname, body = init.body && JSON.parse(init.body), token = init.headers.Authorization;
      calls.push({ path, method: init.method, body, token }); let value;
      if (path.startsWith('/fixture-install/')) value = path.split('/').at(-1);
      else if (path === '/repos/' + repo) value = { default_branch: 'main', ...(token === 'Bearer ACE' && setting !== undefined ? { allow_auto_merge: setting } : {}) };
      else if (path.endsWith('/pulls/' + p.number)) value = p;
      else if (path.endsWith('/events') || path.endsWith('/comments')) value = [];
      else if (path.endsWith('/check-runs') && init.method === 'POST') value = { id: 1 };
      else if (path.endsWith('/check-runs/1')) value = {};
      else if (path.endsWith('/git/ref/heads/main')) value = { object: { sha: main } };
      else if (path.endsWith('/merge')) value = { merged: true };
      else if (path === '/installation/token') return new Response(null, { status: 204 });
      else throw Error('Unexpected metadata fixture request: ' + path);
      return Response.json(value);
    };
    await runner.main({ ...inspectEnv(), GITHUB_REPOSITORY: repo, GITHUB_SERVER_URL: 'https://github.com',
      GH_TOKEN: 'fixture-read', TRUSTED_DIR: source, GITHUB_EVENT_PATH: event,
      MAIN_WALL_VERIFIED: String(wall), GO_COUNTING_ENABLED: 'false', ACE_APP_ID: '5552138' });
    assert.deepEqual(calls.filter(c => c.path === '/repos/' + repo).map(c => c.token), wall ? ['Bearer fixture-read', 'Bearer ACE'] : ['Bearer fixture-read']);
    assert.deepEqual(calls.filter(c => c.path.startsWith('/fixture-install/')).map(c => c.path), wall ? ['/fixture-install/REFEREE', '/fixture-install/ACE'] : ['/fixture-install/REFEREE']);
    const check = calls.filter(c => c.body?.conclusion).at(-1)?.body;
    const merges = calls.filter(c => c.path.endsWith('/merge'));
    if (wall && setting === false) {
      assert.equal(check.conclusion, 'success');
      assert.deepEqual(merges.map(c => [c.token, c.body]), [['Bearer ACE', { sha: head, merge_method: 'squash' }]]);
    } else {
      assert.equal(check.conclusion, 'failure'); assert.equal(check.output.title, 'auto-merge must stay off');
      assert.equal(merges.length, 0); assert.equal(calls.filter(c => c.path.endsWith('/comments') && c.method === 'POST').length, 0);
    }
    assert.deepEqual(calls.filter(c => c.path === '/installation/token' && c.method === 'DELETE').map(c => c.token).sort(), wall ? ['Bearer ACE', 'Bearer REFEREE'] : ['Bearer REFEREE']);
  } finally { globalThis.fetch = priorFetch; }
});

const governedPolicy = () => readFileSync(resolve(here, '../governance-paths'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
for (const path of ['drafts/x.md', 'inc/a.php', 'pages/a.html']) test('routine allow file permits ' + path, () => {
  assert.equal(m.classify([{ path, mode: '100644' }], governedPolicy(), false, ['*']).kind, 'routine');
});
for (const path of ['x.yml', 'docs/x.yaml', 'package.json', 'CLAUDE.md', 'GEMINI.md', 'docs/SKILL.md', 'scripts/a.sh']) test('routine allow file preserves protection for ' + path, () => {
  assert.notEqual(m.classify([{ path, mode: '100644' }], governedPolicy(), false, ['*']).kind, 'routine');
});
test('routine allow file and agent rule files are governed', () => {
  for (const path of ['.github/ci/routine-paths', 'AGENTS.md', 'docs/AGENTS.md', 'CLAUDE.md', 'docs/CLAUDE.md', 'GEMINI.md', 'docs/GEMINI.md', 'docs/SKILL.md', 'scripts/a.sh']) assert(m.matches(path, governedPolicy()), path);
});
test('routine allow file uses the existing matcher and every changed path must match', () => {
  const changes = [{ path: 'DRAFTS/x.md', mode: '100644' }];
  assert.equal(m.classify(changes, [], false, ['drafts/?.md']).kind, 'routine');
  assert.equal(m.classify([...changes, { path: 'inc/a.php', mode: '100644' }], [], false, ['drafts/?.md']).kind, 'hold');
});
test('routine allow file preserves modes, hidden paths, collisions and sticky holds', () => {
  for (const change of [
    { path: 'drafts/x.md', mode: '100755' }, { path: 'drafts/x.md', mode: '120000' }, { path: 'drafts/x.md', mode: '160000' },
    { path: 'drafts/.hidden.md', mode: '100644' }, { path: 'drafts/x.md', mode: '100644', collision: true }
  ]) assert.equal(m.classify([change], [], false, ['*']).kind, 'hold');
  assert.equal(m.classify([{ path: 'drafts/x.md', mode: '100644' }], [], true, ['*']).kind, 'hold');
  assert.deepEqual(m.classify([{ path: '.github/workflows/x.yml', mode: '100644' }], governedPolicy(), false, ['*']), { kind: 'governed', workflow: true });
});
for (const scan of [4, 2]) test('routine allow file does not waive scan result ' + scan, async () => {
  const x = await exercise(pr(), { synthetic: true, scan });
  assert.ifError(x.error); assert.equal(x.check.conclusion, 'failure'); assert.equal(x.merges.length, 0);
});
for (const headRepo of [{ full_name: 'fork/repo' }, null]) test('routine allow file does not waive fork hold ' + JSON.stringify(headRepo), async () => {
  const p = pr(); p.head.repo = headRepo;
  const x = await exercise(p, { synthetic: true, go: true });
  assert.ifError(x.error); assert.equal(x.check.conclusion, 'failure'); assert.equal(x.merges.length, 0);
});
for (const content of [null, '', '# no routine paths\n', '# configured on trusted main\n*\n']) test('trusted routine file content ' + JSON.stringify(content), async () => {
  const p = pr(), calls = [], priorFetch = globalThis.fetch, file = join(source, '.github/ci/routine-paths');
  const original = readFileSync(file), event = join(root, 'routine-event.json');
  writeFileSync(event, JSON.stringify({ pull_request: { number: p.number } }));
  const code = readFileSync(process.env.REFEREE_MODULE || join(here, 'referee.mjs'), 'utf8').replace(/async function installation\([\s\S]*?(?=function command\()/, 'async function installation(api, name) { return name; }\n');
  const runner = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  try {
    if (content === null) rmSync(file); else writeFileSync(file, content);
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname, body = init.body && JSON.parse(init.body); calls.push({ path, method: init.method, body }); let value;
      if (path === '/repos/' + repo) value = { default_branch: 'main', allow_auto_merge: false };
      else if (path.endsWith('/pulls/' + p.number)) value = p;
      else if (path.endsWith('/events') || path.endsWith('/comments')) value = [];
      else if (path.endsWith('/check-runs') && init.method === 'POST') value = { id: 1 };
      else if (path.endsWith('/check-runs/1')) value = {};
      else if (path.endsWith('/git/ref/heads/main')) value = { object: { sha: main } };
      else if (path.endsWith('/merge')) value = { merged: true };
      else if (path === '/installation/token') return new Response(null, { status: 204 });
      else throw Error('Unexpected routine fixture request: ' + path);
      return Response.json(value);
    };
    await runner.main({ ...inspectEnv(), GITHUB_REPOSITORY: repo, GITHUB_SERVER_URL: 'https://github.com', GH_TOKEN: 'fixture-read',
      TRUSTED_DIR: source, GITHUB_EVENT_PATH: event, MAIN_WALL_VERIFIED: 'true', GO_COUNTING_ENABLED: 'false', ACE_APP_ID: '5552138' });
    const allowed = content?.includes('*') === true;
    const check = calls.filter(c => c.body?.conclusion).at(-1)?.body;
    assert.equal(check.conclusion, allowed ? 'success' : 'failure');
    assert.equal(calls.filter(c => c.method === 'PUT').length, allowed ? 1 : 0);
    if (!allowed) assert.match(check.output.title, /waiting for George/);
  } finally { globalThis.fetch = priorFetch; writeFileSync(file, original); }
});

test('trusted checkout includes the governed routine policy', () => {
  const paths = workflowConfig().jobs.inspect.steps[0].with['sparse-checkout'].split('\n').map(s => s.trim());
  assert(paths.includes('.github/ci/'));
});

test('routine dial change requires counted go and is eligible for Ace merge', () => {
  const kind = m.classify([{ path: '.github/ci/routine-paths', mode: '100644' }], governedPolicy(), false, ['*']);
  assert.deepEqual(kind, { kind: 'governed', workflow: false });
  for (const go of [false, true]) {
    const d = m.decision({ ...kind, scan: 0, go, draft: false, wall: true, same: true });
    assert.deepEqual([d.success, d.merge], [go, go]);
  }
});

for (const path of ['SKILL.md', 'skill.md', 'AGENT.md', 'docs/QWEN.md', 'opencode.json']) test('agent instruction path requires go: ' + path, () => {
  const kind = m.classify([{ path, mode: '100644' }], governedPolicy(), false, ['*']);
  assert.deepEqual(kind, { kind: 'governed', workflow: false });
  const d = m.decision({ ...kind, scan: 0, go: false, draft: false, wall: true, same: true });
  assert.deepEqual([d.success, d.merge], [false, false]);
});

test('failed GitHub call logs only step, status and query-free route', async () => {
  const p = pr(); p.labels = [{ name: 'hold' }];
  const canary = 'SYNTHETIC_BODY_CANARY_9f3e', logged = [], priorFetch = globalThis.fetch, priorError = console.error;
  const event = join(root, 'failure-event.json'); writeFileSync(event, JSON.stringify({ pull_request: { number: p.number } }));
  const code = readFileSync(process.env.REFEREE_MODULE || join(here, 'referee.mjs'), 'utf8').replace(/async function installation\([\s\S]*?(?=function command\()/, 'async function installation(api, name) { return "fixture-" + name.toLowerCase(); }\n');
  const runner = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  let error;
  try {
    console.error = (...args) => { logged.push(args.map(String).join(' ')); };
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname; let value;
      if (path === '/repos/' + repo) value = { default_branch: 'main', allow_auto_merge: false };
      else if (path.endsWith('/pulls/' + p.number)) value = p;
      else if (path.endsWith('/events')) value = [];
      else if (path.endsWith('/comments') && init.method === 'POST') return new Response(JSON.stringify({ message: canary }), { status: 403, headers: { 'x-canary': canary } });
      else if (path.endsWith('/comments')) value = [];
      else if (path.endsWith('/activity')) value = activity(p);
      else if (path.endsWith('/check-runs') && init.method === 'POST') value = { id: 1 };
      else if (path.endsWith('/check-runs/1')) value = {};
      else if (path === '/installation/token') return new Response(null, { status: 204 });
      else throw Error('Unexpected failure fixture request: ' + path);
      return Response.json(value);
    };
    await runner.main({ ...inspectEnv(), GITHUB_REPOSITORY: repo, GITHUB_SERVER_URL: 'https://github.com', GH_TOKEN: 'fixture-read',
      TRUSTED_DIR: source, GITHUB_EVENT_PATH: event, MAIN_WALL_VERIFIED: 'true', GO_COUNTING_ENABLED: 'true', ACE_APP_ID: '5552138' });
  } catch (e) { error = e; } finally { globalThis.fetch = priorFetch; console.error = priorError; }
  assert(error);
  assert.deepEqual(logged, [`Referee failed closed for PR #7 step=post-go-prompt status=403 route=/repos/${repo}/issues/7/comments`]);
  for (const secret of [canary, 'fixture-ace', 'fixture-read', 'fixture-referee', 'Bearer', 'Authorization']) {
    assert(!logged.join('\n').includes(secret), secret); assert(!error.message.includes(secret), secret);
  }
});
test('failure line strips query strings and labels non-HTTP failures', () => {
  assert.equal(m.failureLine(Object.assign(new Error('x'), { step: 'list-activity', route: '/repos/o/r/activity' })), 'step=list-activity status=none route=/repos/o/r/activity');
  assert.equal(m.failureLine(new Error('secret body')), 'step=unknown status=none');
  assert.equal(m.failureLine({ step: 'bad step\n', status: 'x', route: '/a?b=c' }), 'step=unknown status=none');
});
test('API errors carry the route without its query', async () => {
  const api = new m.Api(async () => new Response('{"message":"hidden"}', { status: 502 }));
  const e = await m.step('list-activity', () => api.list('/repos/o/r/activity?ref=refs%2Fheads%2Fx', 'tok')).catch(e => e);
  assert.equal(m.failureLine(e), 'step=list-activity status=502 route=/repos/o/r/activity');
});
// Keep-alive socket closed by GitHub while Node was blocked in spawnSync (undici: TypeError 'fetch failed', cause UND_ERR_SOCKET).
const staleSocket = () => new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
test('a GET on a stale keep-alive socket is retried once and succeeds', async () => {
  const calls = [];
  const api = new m.Api(async (url, init) => { calls.push(init.method); if (calls.length === 1) throw staleSocket(); return Response.json([{ id: 1 }]); });
  assert.deepEqual(await m.step('list-comments', () => api.request('/repos/o/r/issues/7/comments?per_page=100', 'tok')), [{ id: 1 }]);
  assert.deepEqual(calls, ['GET', 'GET']);
});
test('a second stale-socket GET still fails closed with route and status=none', async () => {
  let calls = 0;
  const api = new m.Api(async () => { calls++; throw staleSocket(); });
  const e = await m.step('list-comments', () => api.list('/repos/o/r/issues/7/comments', 'tok')).catch(e => e);
  assert.equal(calls, 2);
  assert.equal(m.failureLine(e), 'step=list-comments status=none route=/repos/o/r/issues/7/comments');
});
test('a write is never retried, even on a stale socket', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    let calls = 0;
    const api = new m.Api(async () => { calls++; throw staleSocket(); });
    const e = await m.step('post-go-prompt', () => api.request('/repos/o/r/issues/7/comments', 'tok', method, { body: 'x' })).catch(e => e);
    assert.equal(calls, 1, method);
    assert.equal(m.failureLine(e), 'step=post-go-prompt status=none route=/repos/o/r/issues/7/comments');
  }
});
test('a plain network error or a timeout on a GET is not retried', async () => {
  const errors = [new TypeError('fetch failed', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) }),
    new TypeError('fetch failed'), new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    new DOMException('This operation was aborted', 'AbortError'), Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })];
  for (const error of errors) {
    let calls = 0;
    const api = new m.Api(async () => { calls++; throw error; });
    const e = await m.step('list-comments', () => api.request('/repos/o/r/issues/7/comments', 'tok')).catch(e => e);
    assert.equal(e, error); assert.equal(calls, 1, String(error));
  }
});
