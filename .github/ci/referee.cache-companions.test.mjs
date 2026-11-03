// Cache Companions' own Referee dial tests (wall build, plans/wall-build-2026-11-03.md). The shared referee.test.mjs
// stays identical to ea-jorts; this file checks only what Cache Companions changes: the routine dial
// (.github/ci/routine-paths) and the governed list (.github/governance-paths), read from the real files with the
// Referee's own matcher (no second parser). Run: node --test .github/ci/referee.cache-companions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const m = await import(pathToFileURL(join(here, 'referee.mjs')));
// Read exactly as referee.mjs main() reads them (comments and blanks dropped; a missing routine file = []).
const rows = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')) : [];
const governed = rows(resolve(here, '../governance-paths'));
const routine = rows(join(here, 'routine-paths'));
const kind = (path, mode = '100644') => m.classify([{ path, mode }], governed, false, routine).kind;

// Plain notes: safe to merge without George.
const ROUTINE = [
  'plans/wall-build-2026-11-03.md', 'plans/wall-build-2026-11-03.evidence/referee-dial-green.txt', 'plans/v0.3-notes.txt',
  'docs/boop-early-shaky-connections.md', 'docs/buymeacoffee-page.md', 'docs/notes/idea.md', 'docs/x.txt',
];
for (const path of ROUTINE) test('cache-companions dial: routine ' + path, () => assert.equal(kind(path), 'routine'));

// Ships code to users, steers agents, or runs CI: George's go every time.
const GOVERNED = [
  // the plugin itself (installed from main by every user and every fresh cloud container)
  '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'hooks/core.ts', 'hooks/register.tsx', 'hooks/prices.ts',
  'hooks/hooks.json', 'types/index.d.ts', 'tests/core.test.ts', 'tests/plugin.test.tsx', 'tsconfig.json',
  'sounds/hungry.wav', 'sounds/make-hungry.py', 'commands/boop.md', 'agents/x.md', 'skills/x/SKILL.md', 'skills/x/notes.md',
  'output-styles/x.md', 'settings.json', '.mcp.json', 'docs/x.ts', 'plans/x.js', 'docs/x.mjs', 'plans/x.sh', 'docs/x.json',
  // agent rules and the files AGENTS.md tells agents to read first and follow
  'AGENTS.md', 'CLAUDE.md', 'HANDOFF.md', 'STATUS.md', 'ROADMAP.md', 'docs/SPEC.md', 'docs/sub/SKILL.md', 'docs/sub/AGENTS.md',
  // the marketplace page and install commands users copy; the licence
  'README.md', 'LICENSE',
  // the wall itself and CI
  '.github/ci/routine-paths', '.github/governance-paths', '.github/walls.json', '.github/workflows/referee.yml',
  '.github/ci/referee.mjs', '.github/ci/referee.cache-companions.test.mjs', '.github/FUNDING.yml', '.gitleaks.toml',
  '.gitleaksignore', '.gitignore', '.gitattributes', 'docs/x.yml', 'plans/x.yaml',
];
for (const path of GOVERNED) test('cache-companions dial: governed ' + path, () => assert.equal(kind(path), 'governed'));

// Neither routine nor governed: held for George's go.
const HOLD = [
  ['CHANGELOG.md'], ['CONTRIBUTING.md'], ['WORKTREE-SUMMARY.md'], ['notes.md'], ['research/x.md'], ['plans/x.html'],
  ['docs/x.svg'], ['plans/x.log'], ['plans/x.csv'], ['plans/x.MDX'], ['plans/requirements.txt'], ['docs/sub/package.json'],
  ['plans/x.md', '100755'], ['plans/link.md', '120000'], ['docs/.hidden/x.md'], ['plans/.x.md'],
];
for (const [path, mode] of HOLD) test('cache-companions dial: hold ' + path + (mode ? ' ' + mode : ''), () => assert.notEqual(kind(path, mode), 'routine'));

test('cache-companions dial: one non-routine file holds the whole PR', () => {
  assert.equal(m.classify([{ path: 'plans/a.md', mode: '100644' }, { path: 'CHANGELOG.md', mode: '100644' }], governed, false, routine).kind, 'hold');
});
test('cache-companions dial: one plugin file governs the whole PR', () => {
  assert.equal(m.classify([{ path: 'docs/a.md', mode: '100644' }, { path: 'hooks/core.ts', mode: '100644' }], governed, false, routine).kind, 'governed');
});
test('cache-companions dial: a sticky hold label still holds routine files', () => {
  assert.equal(m.classify([{ path: 'plans/a.md', mode: '100644' }], governed, true, routine).kind, 'hold');
});
test('cache-companions dial: the dial is not the ea-jorts "*": only .md/.txt beneath plans/ and docs/', () => {
  assert(routine.length > 0 && !routine.includes('*'));
  for (const r of routine) assert.match(r, /^(plans|docs)\/\*\.(md|txt)$/);
});
test('cache-companions governed list: no ea-jorts-only path is carried over', () => {
  assert(!governed.some(g => g.includes('orch-loop/orchestration-role-charter')));
});
test('cache-companions plugin manifest: no component path points into the routine folders', () => {
  // A plugin.json "commands"/"agents"/"skills"/"hooks" path into docs/ or plans/ would ship routine files to users.
  const manifest = readFileSync(resolve(here, '../../.claude-plugin/plugin.json'), 'utf8');
  assert.doesNotMatch(manifest, /["'](\.\/)?(docs|plans)\//i);
});
