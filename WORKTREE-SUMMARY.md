# Worktree summary: boop early on shaky connections

**Branch:** `claude/boop-early-shaky-connections-65352e` · **Version 0.2.8 prepared, not pushed.**

## What landed
- Fix for everyone: a failed boop (dropped connection, API error) no longer counts as fed. It used to reset the countdown, say "paid to rebuild" and pause auto-boop. A boop now counts only when a cache read comes back.
- Retries with backoff (30 s → 60 s → 2 min, or half the time left, at least 5 s) until the window's last 3 s. Failure kinds (offline / busy / refused) take the place of a separate connection check.
- A boop with no answer in 20 s stops holding up retries; at most two are out at once; a late reply only adds its cost.
- The countdown restarts from when a boop was sent.
- `/boop early <10–95>` and `/boop early off` (off by default); `/boop remote` and `/boop remote off` (70%, retries, 0–10 s stagger per pane). Both are rows in the settings pane.
- Band and CLI words `retrying`, `offline`, `likely cold`, `remote`; one likely-cold toast; `/boop stats` counts failed boops and windows lost.
- Docs: README, SPEC, CHANGELOG (Unreleased), ROADMAP, AGENTS decisions, and the design note copied into `docs/`.

## Fixed after the live test
- Conversation size, long-prompt price and "prevented" used a turn's summed usage (831k shown for a 98k conversation); now the conversation's real size.
- Terminal panel (`TERM_PROGRAM=claude-desktop`) garbled the timer after an emoji face; the CLI entry uses the text face there.

## Checks
54 tests pass (38 old, 16 new); `claude plugin validate .` passes with the 2 warnings that were already there; tsc is clean via an outside tsconfig naming the plugin-authoring types.

## Not done
- Live test: steps 1–2 passed on George's Mac; step 4 (three panes, remote) optional.
- Push to main: waits for George's word.
- Main must handle: `.session-resume/` isn't gitignored in this repo, so it was left uncommitted here.
