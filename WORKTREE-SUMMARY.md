# Worktree summary: boop early on shaky connections

**Branch:** `claude/boop-early-shaky-connections-65352e` · **Not pushed, not released** (version still 0.2.7).

## What landed
- Fix for everyone: a failed boop (dropped connection, API error) no longer counts as fed. It used to reset the countdown, say "paid to rebuild" and pause auto-boop. A boop now counts only when a cache read comes back.
- Retries with backoff (30 s → 60 s → 2 min, or half the time left, at least 5 s) until the window's last 3 s. Failure kinds (offline / busy / refused) take the place of a separate connection check.
- A boop with no answer in 20 s stops holding up retries; at most two are out at once; a late reply only adds its cost.
- The countdown restarts from when a boop was sent.
- `/boop early <10–95>` and `/boop early off` (off by default); `/boop remote` and `/boop remote off` (70%, retries, 0–10 s stagger per pane). Both are rows in the settings pane.
- Band and CLI words `retrying`, `offline`, `likely cold`, `remote`; one likely-cold toast; `/boop stats` counts failed boops and windows lost.
- Docs: README, SPEC, CHANGELOG (Unreleased), ROADMAP, AGENTS decisions, and the design note copied into `docs/`.

## Checks
51 tests pass (38 old, 13 new); `claude plugin validate .` passes with the 2 warnings that were already there; tsc is clean via an outside tsconfig naming the plugin-authoring types.

## Not done
- George's live test on a weak connection (the five checks in the design note).
- Release: version bump to 0.3.0, CHANGELOG date, STATUS, push. These wait for George's word.
- Main must handle: `.session-resume/` isn't gitignored in this repo, so it was left uncommitted here.
