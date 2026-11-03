# Build the Cache Companions wall

2026-11-03 · The ea-jorts wall kit, copied the way gs PR #189 (merged `b83b251a`) copied it, with Cache Companions' own dial. Draft PR; no ruleset, App, environment, variable or repository setting was changed (George does those, below).

## What this PR adds

**The ea-jorts wall kit, copied unchanged** from ea-jorts main `820f02ce` (it includes the Referee fixes #20 and #22, below). The first commit of this PR is the plain copy (same blobs and modes, `kit-identical.txt`), so every Cache Companions change is a visible diff:

- `.github/workflows/{referee,branch-scan,push-log-scan}.yml`
- `.github/ci/{referee.mjs,referee.test.mjs,push-rules.sh,push-log-scan.sh,alert-george.sh,PUSH-RULES.md,routine-paths}`
- `.github/{walls.json,governance-paths}`

Not copied: ea-jorts' `.gitleaksignore` (its fingerprints are ea-jorts' own). The scripts read `.gitleaks.toml` / `.gitleaksignore` only if present; the scan runs clean without them (`push-rules-branch.txt`). Every action is pinned to a full SHA (`actions/checkout@11d5960a326750d5838078e36cf38b85af677262`, the only action used); gitleaks 8.30.1 is checksum-pinned.

**Cache Companions changes to the kit:**

- `.github/ci/routine-paths`, the dial: only `.md` and `.txt` beneath `plans/` and `docs/` may merge without George's go. The Referee's own `matches()` reads it; no second parser.
- `.github/governance-paths`: the ea-jorts rows less ea-jorts' charter row, plus everything that ships to users or steers agents:
  - the plugin, which every user and every fresh cloud container installs from main: `.claude-plugin/*`, `hooks/*`, `types/*`, `tests/*`, `sounds/*`, `commands/*`, `agents/*`, `skills/*`, `output-styles/*`, `settings.json`, `tsconfig.json`, and `*.ts *.tsx *.js *.mjs *.cjs *.py *.sh *.json` anywhere;
  - the files AGENTS.md tells agents to read first and follow: `HANDOFF.md`, `STATUS.md`, `ROADMAP.md`, `docs/SPEC.md` (AGENTS.md, CLAUDE.md and every skill/agent rule file were already governed by the kit's rows);
  - `README.md` (the marketplace page and the install commands users copy) and `LICENSE`.
  - Everything else (`CHANGELOG.md`, `CONTRIBUTING.md`, `WORKTREE-SUMMARY.md`, any other root file or folder) holds for George's go.
- `.github/walls.json`: this repo, `DRAFT_NOT_INSTALLED`, one required check: `referee` bound to the Referee App `5552272`. No stamped check: this repo has no `verdict-check`, so none is added or required. Settings record the target (squash-only, auto-merge off); the Watch path is replaced by "not yet approved".
- `.github/ci/PUSH-RULES.md`: the ea-jorts-only passages (step 3's tracked-file note, the minutes budget, the routine-files paragraph, "squash only" as fact) rewritten for this repo, as gs did.
- `.github/ci/referee.cache-companions.test.mjs`: this repo's dial tests (below).

`AGENTS.md`, `CLAUDE.md`, `README.md` and the plugin are not touched.

## Tests (red, then green)

Evidence: `plans/wall-build-2026-11-03.evidence/`.

- The dial, `.github/ci/referee.cache-companions.test.mjs` (real paths through the Referee's own `classify()`): 42 of 76 fail against the unchanged kit, where `'*'` would let `hooks/core.ts`, `.claude-plugin/plugin.json` and `README.md` merge without George (`referee-dial-red.txt`); 76/76 after the two files (`referee-dial-green.txt`). One case also checks that `plugin.json` names no component path inside `docs/` or `plans/`, so routine notes can never ship as plugin code.
- The shared `referee.test.mjs`, unchanged, under this repo's governed list and record, with the pinned gitleaks 8.30.1 (checksum checked) on the path: 68/68 (`referee-shared-suite-green.txt`).
- `push-rules.sh` over this PR's commits: clean (`push-rules-branch.txt`).
- AGENTS.md's checks: `claude plugin validate .` passes (with the usual directory warnings); `claude plugin test .` 54/54 (`plugin-checks.txt`). `tsc -p .` not run: no `.claude-plugin/types/` in this checkout, and no TypeScript file changed.

## Known issue carried with the kit

The ea-jorts Referee was **failing closed on Ace's "reply go" prompt post** (the comment asking George to reply `go`). This kit is copied as-is from ea-jorts main `820f02ce`, which carries the two Referee fixes from that work:

- **#20** names the failed step when the Referee fails closed: the step, the HTTP status and the API route. Bodies, tokens and headers are never printed.
- **#22** retries a GET once on a stale keep-alive socket (`UND_ERR_SOCKET`). That error made every governed PR fail closed. Writes are never retried.

Whether the prompt post itself now succeeds is proven only live, once the Apps are installed. If it still fails, the #20 log line names the step and status; copy any later ea-jorts fix here as its own governed PR. Failing closed means a PR stays red, never that one merges.

## George's click list (in order; nothing here was done)

1. **Apps.** Install **Ace** (`ace-samuelson`, App 5552138) and the **Referee** (`referee-samuelson`, App 5552272) on `georgesamuelson/cache-companions` (or add this repo to their existing installations).
2. **Environment.** Settings → Environments → new `referee`: deployment branches **main only**; secrets `REFEREE_PRIVATE_KEY` and `ACE_PRIVATE_KEY` (the two App keys).
3. **Variables** (Settings → Secrets and variables → Actions → Variables):
   - `MAIN_WALL_VERIFIED=false` (set `true` only after step 6 is read back with the Referee bound);
   - `GO_COUNTING_ENABLED=false` (stays off until the Mac logout and identity proof);
   - `PUSH_LOG_SCAN_INSTALLED_AT` = the install time, like `2026-11-03T15:00:00Z`.
4. **Actions.** Settings → Actions → General: workflow permissions **Read repository contents**; **Require actions to be pinned to a full-length commit SHA** on.
5. **Merging.** Settings → General → Pull Requests: **Allow squash merging only** (merge commits and rebase off; today merge commits are on); **Allow auto-merge off**; automatically delete head branches on.
6. **Ruleset** `main-wall` (Settings → Rules → Rulesets), Active, target `main`, **no bypass**: restrict deletions; block force pushes; require a pull request, **0 approvals**; require status check **`referee`** from the Referee App (5552272), strict up-to-date off.
7. Then merge this PR (squash). It is governed: it lands only with George.

## Open items for George

1. **The release steps push to main.** AGENTS.md "Releasing" step 3 ("Commit and push to `main`") and HANDOFF.md stop working once the ruleset is on (PR required, squash-only, rebase never merge-from-main). Both are governed; a follow-on PR rewords them once you say how releases should land.
2. **This PR is not judged by a Referee.** `pull_request_target` runs main's workflows, and main has no Referee yet, so this PR has no `referee` check until it merges. Review it by hand.
3. **Bootstrap noise (expected).** The pushed branch carries `branch-scan.yml`, so each push runs it from the branch; main has no `push-rules.sh` yet, so it reports "cannot evaluate" and its alert job may open one issue ("Push rules: an alert", details withheld because the repo is public). Close it with one line. The Referee and the 6-hourly scans run only once they are on main.
4. **Public repo.** Every alert withholds details; the hand-run is PUSH-RULES.md step 7 with `REPORT_ONLY=1`.
5. **Outside Watch.** This repo's Watch baseline and alarm delivery are not approved or deployed (outside GitHub; yours).
