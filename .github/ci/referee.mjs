// Trusted main-only Referee. PR objects are data: never checkout or execute their files.
import { createSign } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const SHA = /^[a-f0-9]{40}$/;
const ID = /^[1-9][0-9]*$/;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const time = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s) ? Date.parse(s) : NaN;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const dependencyPath = path => /(^|\/)(package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-(?:lock|workspace)\.yaml|bun\.lockb?|bunfig\.toml|pyproject\.toml|poetry\.(?:lock|toml)|uv\.(?:lock|toml)|(?:requirements|constraints)[^/]*\.(?:txt|in)|setup\.(?:py|cfg)|pip\.(?:conf|ini)|Cargo\.(?:toml|lock)|rust-toolchain(?:\.toml)?|go\.(?:mod|sum|work(?:\.sum)?)|Gemfile(?:\.lock)?|gems\.(?:rb|locked)|[^/]+\.gemspec|composer\.(?:json|lock)|\.npmrc|\.yarnrc[^/]*|\.pnpmfile\.cjs|\.pnp\.(?:js|cjs|data\.json|loader\.mjs)|Pipfile(?:\.lock)?|deno\.(?:jsonc?|lock)|import[_-]map\.json)$/i.test(path)
  || /(^|\/)(?:\.cargo\/config(?:\.toml)?|\.bundle\/config|\.yarn\/.+|patches\/.+\.patch)$/i.test(path);
export function validPR(p, repo) {
  requireValue(object(p) && Number.isSafeInteger(p.number) && p.number > 0 && SHA.test(p.head?.sha) && SHA.test(p.base?.sha)
    && p.base?.repo?.full_name === repo && p.base.ref === 'main' && p.state === 'open'
    && typeof p.draft === 'boolean' && typeof p.node_id === 'string' && Array.isArray(p.labels), 'Unreadable PR');
  return p;
}
export function matches(path, patterns) {
  return patterns.some(p => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.') + '$', 'i').test(path));
}
// Missing routine policy permits nothing; governed and held paths keep precedence.
export function classify(changes, patterns, held = false, routine = []) {
  requireValue(Array.isArray(changes) && changes.length > 0, 'No complete changed-file inventory');
  let kind = held ? 'hold' : 'routine', workflow = false;
  for (const c of changes) {
    requireValue(typeof c.path === 'string' && c.path.length > 0, 'Malformed changed path');
    if (matches(c.path, patterns)) kind = 'governed';
    if (/^\.github\/workflows\//i.test(c.path)) { kind = 'governed'; workflow = true; }
    if (/^(100755|120000|160000)$/.test(c.mode) || /(^|\/)\./.test(c.path) || /[\x00-\x1f\x7f]/.test(c.path) || c.collision) {
      if (kind !== 'governed') kind = 'hold';
    }
    if ((!matches(c.path, routine) || dependencyPath(c.path)) && kind !== 'governed') kind = 'hold';
  }
  return { kind, workflow };
}
export function everHeld(p, events) {
  requireValue(Array.isArray(events) && events.every(e => object(e) && typeof e.event === 'string'), 'Unreadable label history');
  requireValue(p.labels.every(l => typeof l?.name === 'string') && events.every(e => !['labeled', 'unlabeled'].includes(e.event) || typeof e.label?.name === 'string'), 'Unreadable labels');
  return p.labels.some(l => typeof l?.name === 'string' && l.name.toLowerCase() === 'hold')
    || events.some(e => ['labeled', 'unlabeled'].includes(e.event) && e.label?.name?.toLowerCase() === 'hold');
}
export function promptFor(p) {
  return `@georgesamuelson: reply \`go\` to merge exactly ${p.head.sha}.\n`
    + 'A workflow change becomes ready for your hand merge. A new head needs a new reply.';
}
export function countedGo(p, comments, activity, aceId, enabled, now = Date.now()) {
  if (!enabled) return false;
  requireValue(Array.isArray(comments) && Array.isArray(activity), 'Unreadable approval history');
  // Use server push time, never author/committer dates supplied by the branch.
  const pushes = activity.filter(a => ['push', 'force_push', 'branch_creation', 'pr_merge', 'merge_queue_merge'].includes(a.activity_type)
    && a.ref === `refs/heads/${p.head.ref}` && a.after === p.head.sha);
  if (!pushes.length || pushes.some(a => !Number.isFinite(time(a.timestamp)) || time(a.timestamp) > now)) return false;
  const pushedAt = Math.max(...pushes.map(a => time(a.timestamp)));
  const prompts = comments.filter(c => c.user?.type === 'Bot' && c.performed_via_github_app?.id === Number(aceId)
    && c.body === promptFor(p) && c.created_at === c.updated_at && time(c.created_at) >= pushedAt && time(c.created_at) <= now);
  if (!prompts.length) return false;
  const challengedAt = Math.max(...prompts.map(c => time(c.created_at)));
  return comments.some(c => c.user?.login === 'georgesamuelson' && c.user?.type === 'User'
    && c.performed_via_github_app === null && typeof c.body === 'string' && c.body.trim() === 'go'
    && c.created_at === c.updated_at && time(c.created_at) > challengedAt && time(c.created_at) <= now);
}
export function decision({ kind, workflow, scan, go, draft, wall, same }) {
  if (!same || !wall || draft || ![0, 4].includes(scan)) return { success: false, merge: false, note: 'blocked: scan, identity, wall, draft, or head changed' };
  if ((kind !== 'routine' || scan === 4) && !go) return { success: false, merge: false, note: 'waiting for George’s counted go on this exact head' };
  return { success: true, merge: !workflow, note: workflow ? 'ready: George merges this one (it changes workflows)' : 'ready: exact head may merge after all required checks' };
}
// Failure diagnostics: only a step label, HTTP status and query-free API route; never bodies, messages, tokens or headers.
export async function step(name, work) {
  try { return await work(); } catch (e) { if (e instanceof Error) e.step ??= name; throw e; }
}
export function failureLine(e) {
  const label = typeof e?.step === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(e.step) ? e.step : 'unknown';
  const status = Number.isSafeInteger(e?.status) && e.status >= 100 && e.status <= 599 ? e.status : 'none';
  const route = typeof e?.route === 'string' && /^\/[A-Za-z0-9_.\/-]{0,200}$/.test(e.route) ? ` route=${e.route}` : '';
  return `step=${label} status=${status}${route}`;
}

export class Api {
  constructor(fetcher = fetch) { this.fetcher = fetcher; }
  async request(path, token, method = 'GET', body) {
    requireValue(path.startsWith('/') && !path.startsWith('//'), 'Invalid API path');
    const send = () => this.fetcher('https://api.github.com' + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    try {
      let res;
      // A long spawnSync inspection lets GitHub close the idle keep-alive socket; a read on it fails with
      // UND_ERR_SOCKET and no response. Retry such a GET once. Writes, timeouts and all else fail closed.
      try { res = await send(); } catch (e) {
        if (method !== 'GET' || !(e instanceof TypeError) || e.cause?.code !== 'UND_ERR_SOCKET') throw e;
        res = await send();
      }
      if (!res.ok) {
        const message = [405, 409].includes(res.status) ? (await res.json().catch(() => null))?.message : null;
        const e = new Error(typeof message === 'string' && message ? message : `GitHub request failed (${res.status})`); e.status = res.status; throw e;
      }
      if (res.status === 204) return null;
      return await res.json(); // Empty/malformed successful bodies fail closed.
    } catch (e) { if (e instanceof Error) e.route ??= path.split('?')[0]; throw e; }
  }
  async list(path, token) {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const rows = await this.request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token);
      requireValue(Array.isArray(rows), 'Unreadable paginated response'); all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw new Error('Pagination limit reached; coverage not certified');
  }
}
async function installation(api, name, repo, env, permissions) {
  const id = env[`${name}_APP_ID`], key = env[`${name}_PRIVATE_KEY`];
  requireValue(ID.test(id || '') && key, `${name} App configuration missing`);
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 60, exp: now + 480, iss: id })}`;
  const jwt = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
  const app = await api.request('/app', jwt);
  requireValue(app.id === Number(id), 'Unexpected App identity');
  const install = await api.request(`/repos/${repo}/installation`, jwt);
  requireValue(Number.isSafeInteger(install.id) && install.id > 0, 'Missing App installation');
  const result = await api.request(`/app/installations/${install.id}/access_tokens`, jwt, 'POST', { repositories: [repo.split('/')[1]], permissions });
  requireValue(typeof result.token === 'string' && result.token.length > 0 && time(result.expires_at) > Date.now()
    && object(result.permissions) && Object.entries(result.permissions).every(([k, v]) => (permissions[k] || (k === 'metadata' ? 'read' : null)) === v), 'Unexpected installation grant');
  return result.token;
}
function command(args, cwd, env) {
  const r = spawnSync(args[0], args.slice(1), { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  requireValue(!r.error && r.status === 0, 'Trusted inspection command failed'); return r.stdout;
}
export function inspectGit(p, trusted, dir, env) {
  const safeEnv = { PATH: env.PATH, HOME: env.HOME, TMPDIR: dir, GH_TOKEN: env.GH_TOKEN,
    ORCH_WORKER: env.ORCH_WORKER,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_ATTR_SOURCE: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', LC_ALL: 'C' };
  const git = (...args) => command(['git', ...args], dir, safeEnv).trimEnd();
  git('init', '-q');
  git('remote', 'add', 'origin', `https://github.com/${p.base.repo.full_name}.git`);
  git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'fetch', '-q', '--no-tags', 'origin',
    '+refs/heads/main:refs/remotes/origin/main', `+refs/pull/${p.number}/head:refs/remotes/origin/pr`);
  const main = git('rev-parse', 'origin/main');
  requireValue(command(['git', 'rev-parse', 'HEAD'], trusted, safeEnv).trim() === main, 'Trusted main snapshot changed; retry from current main');
  requireValue(git('rev-parse', 'origin/pr') === p.head.sha, 'Refs moved during fetch');
  const mergeBase = git('merge-base', main, p.head.sha);
  const commits = git('rev-list', p.head.sha, `^${main}`).split('\n').filter(Boolean);
  requireValue(commits.length > 0 && commits.length <= 10000, 'Incomplete or excessive commit range');
  const changes = [];
  for (const c of commits) {
    requireValue(SHA.test(c), 'Malformed commit');
    const parents = git('rev-list', '--parents', '-n', '1', c).split(' ');
    requireValue(parents.length <= 2, 'Merge commit in PR range; rebase required');
    const range = parents.length > 1 ? [parents[1], c] : ['--root', c];
    const fields = git('diff-tree', '-r', '-z', '--raw', '--no-abbrev', '--no-renames', '--no-commit-id', ...range).split('\0');
    const paths = git('ls-tree', '-rz', '--name-only', c).split('\0').filter(Boolean);
    const folded = new Map(); for (const path of paths) folded.set(path.toLowerCase(), (folded.get(path.toLowerCase()) || 0) + 1);
    for (let i = 0; i < fields.length && fields[i]; i += 2) {
      const meta = fields[i].match(/^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])$/);
      requireValue(meta && fields[i + 1], 'Malformed raw diff');
      changes.push({ commit: c, parent: parents[1] || null, path: fields[i + 1], mode: meta[2] === '000000' ? meta[1] : meta[2], collision: (folded.get(fields[i + 1].toLowerCase()) || 0) > 1 });
    }
  }
  const scanEnv = { ...safeEnv, TRUSTED_DIR: trusted, SCAN_LOCAL: '1', SCAN_DEPTH: '0', MAIN: 'main', MAINREF: 'origin/main', SUMMARY: join(dir, 'scan-summary.md') };
  const scanned = spawnSync('bash', [join(trusted, '.github/ci/push-rules.sh'), mergeBase, p.head.sha, `PR-${p.number}`], { cwd: dir, env: scanEnv, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  // Scanner output is never echoed; it can contain private paths. Only the numeric outcome crosses this boundary.
  return { changes, scan: scanned.error ? 2 : scanned.status, git, mergeBase, main };
}
export async function processPR(api, p, ctx) {
  const base = `/repos/${ctx.repo}`, read = ctx.read, judge = ctx.judge, ace = ctx.ace;
  p = validPR(p, ctx.repo);
  const check = await step('create-check', async () => {
    const c = await api.request(`${base}/check-runs`, judge, 'POST', { name: 'referee', head_sha: p.head.sha, status: 'in_progress', external_id: `${p.number}:${p.head.sha}:${p.base.sha}` });
    requireValue(Number.isSafeInteger(c.id) && c.id > 0, 'Unreadable check creation'); return c;
  });
  let dir, main;
  const finish = d => step('finish-check', () => api.request(`${base}/check-runs/${check.id}`, judge, 'PATCH', { status: 'completed', conclusion: d.success ? 'success' : 'failure', output: { title: d.note, summary: d.note + (main ? `\nInspected against main ${main}` : '') } }));
  if (ctx.allowAutoMerge !== false) {
    const blocked = { success: false, merge: false, note: 'auto-merge must stay off' };
    await finish(blocked); return blocked;
  }
  try {
    const events = await step('list-events', () => api.list(`${base}/issues/${p.number}/events`, read));
    // Forks and missing source repositories have no supported counted-go proof.
    // They must enter the held path even when every changed file is routine.
    const held = everHeld(p, events) || p.head.repo?.full_name !== ctx.repo;
    dir = mkdtempSync(join(tmpdir(), 'referee-'));
    const inspected = await step('inspect-git', () => ctx.inspect ? ctx.inspect(p) : inspectGit(p, ctx.trusted, dir, ctx.env));
    main = inspected.main;
    const classified = classify(inspected.changes, ctx.patterns, held || inspected.scan === 4, ctx.routine);
    let go = false;
    if (classified.kind !== 'routine') {
      const comments = await step('list-comments', () => api.list(`${base}/issues/${p.number}/comments`, read));
      // Same-repository branches only can count a go; fork approvals hold pending a supported push-time source.
      if (ctx.goEnabled && ace && p.head.repo?.full_name === ctx.repo) {
        const activity = await step('list-activity', () => api.list(`${base}/activity?ref=${encodeURIComponent(`refs/heads/${p.head.ref}`)}&time_period=quarter`, read));
        go = countedGo(p, comments, activity, ctx.aceId, true, ctx.now ?? Date.now());
        const currentPush = activity.filter(a => a.ref === `refs/heads/${p.head.ref}` && a.after === p.head.sha && Number.isFinite(time(a.timestamp)));
        const pushedAt = Math.max(...currentPush.map(a => time(a.timestamp)));
        const prompted = comments.some(c => c.body === promptFor(p) && c.performed_via_github_app?.id === Number(ctx.aceId) && c.user?.type === 'Bot' && time(c.created_at) >= pushedAt);
        if (!go && !prompted && currentPush.length) await step('post-go-prompt', () => api.request(`${base}/issues/${p.number}/comments`, ace, 'POST', { body: promptFor(p) }));
      }
    }
    const current = await step('refresh-pull', async () => validPR(await api.request(`${base}/pulls/${p.number}`, read), ctx.repo));
    const same = current.head.sha === p.head.sha && current.draft === p.draft;
    // A newly applied hold between classification and publication must not inherit a routine green.
    if (classified.kind === 'routine' && everHeld(current, await step('recheck-events', () => api.list(`${base}/issues/${p.number}/events`, read)))) classified.kind = 'hold';
    // A same-SHA refresh may lose or change the source repository: revoke any go too.
    if (current.head.repo?.full_name !== ctx.repo) {
      if (classified.kind === 'routine') classified.kind = 'hold';
      go = false;
    }
    const d = decision({ ...classified, scan: inspected.scan, go, draft: current.draft, wall: ctx.wall && Boolean(ace), same });
    await finish(d);
    if (d.merge) {
      const latest = await step('premerge-pull', async () => validPR(await api.request(`${base}/pulls/${p.number}`, read), ctx.repo));
      const newHold = everHeld(latest, []) && !everHeld(p, []);
      requireValue(latest.head.sha === p.head.sha && !newHold, 'PR head or hold changed before merge');
      const latestMain = (await step('read-main', () => api.request(`${base}/git/ref/heads/main`, read)))?.object?.sha;
      requireValue(SHA.test(main) && SHA.test(latestMain), 'Unreadable main tip');
      if (latestMain !== main) {
        Object.assign(d, { success: false, merge: false, note: `main moved since inspection (${main} -> ${latestMain}); re-checking` });
        await finish(d); return d;
      }
      try {
        await step('merge', async () => requireValue((await api.request(`${base}/pulls/${p.number}/merge`, ace, 'PUT', { sha: p.head.sha, merge_method: 'squash' })).merged === true, 'Merge not confirmed'));
      } catch (e) {
        if (![405, 409].includes(e.status)) throw e;
        Object.assign(d, { success: false, merge: false, note: `GitHub refused the merge: ${e.message.slice(0, 300)}; push or update to retry` });
        await finish(d);
      }
    }
    return d;
  } catch (e) {
    // Carry only the diagnostic fields; a failed red-check update must not hide the first failure.
    const failed = Object.assign(new Error('Referee inspection failed'), { step: e?.step, status: e?.status, route: e?.route });
    await finish({ success: false, note: 'blocked: inspection or API failed; no merge authorized' }).catch(() => {});
    throw failed; // Never print untrusted bodies, file contents, or credentials.
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
}
export async function main(env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  requireValue(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || ''), 'Missing repository');
  const api = new Api(), read = env.GH_TOKEN;
  requireValue(read && env.GITHUB_SERVER_URL === 'https://github.com', 'Unsupported runtime');
  const metadata = await api.request(`/repos/${repo}`, read);
  requireValue(metadata.default_branch === 'main', 'Expected main as default');
  const trusted = resolve(env.TRUSTED_DIR || '.');
  const patterns = readFileSync(join(trusted, '.github/governance-paths'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  requireValue(patterns.length > 0, 'Missing governed paths');
  const routineFile = join(trusted, '.github/ci/routine-paths');
  const routine = existsSync(routineFile) ? readFileSync(routineFile, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')) : [];
  const judge = await installation(api, 'REFEREE', repo, env, { checks: 'write' });
  let ace;
  try {
    if (env.MAIN_WALL_VERIFIED === 'true') {
      ace = await installation(api, 'ACE', repo, env, { contents: 'write', pull_requests: 'write' });
      metadata.allow_auto_merge = (await api.request(`/repos/${repo}`, ace)).allow_auto_merge;
    }
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const number = event.pull_request?.number || (event.issue?.pull_request ? event.issue.number : null);
    const pulls = number ? [await api.request(`/repos/${repo}/pulls/${Number(number)}`, read)] : await api.list(`/repos/${repo}/pulls?state=open&base=main`, read);
    const ctx = { repo, read, judge, ace: metadata.allow_auto_merge === false ? ace : undefined, allowAutoMerge: metadata.allow_auto_merge, aceId: env.ACE_APP_ID, env, trusted, patterns, routine, wall: env.MAIN_WALL_VERIFIED === 'true', goEnabled: env.GO_COUNTING_ENABLED === 'true' };
    let failed = false;
    for (const p of pulls) {
      if (p.state !== 'open' || p.base?.ref !== 'main') continue;
      try { await processPR(api, await step('read-pull', () => api.request(`/repos/${repo}/pulls/${p.number}`, read)), ctx); }
      catch (e) { failed = true; console.error(`Referee failed closed for PR #${p.number} ${failureLine(e)}`); }
    }
    requireValue(!failed, 'At least one PR could not be evaluated');
  } finally {
    for (const token of [ace, judge].filter(Boolean)) await api.request('/installation/token', token, 'DELETE').catch(() => { throw new Error('Installation token revocation failed'); });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Referee failed closed; inspect configuration or API availability.'); process.exitCode = 1; });
}
