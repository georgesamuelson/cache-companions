# Status

**Last updated:** 2026-10-27 · **Version:** 0.2.8 (ready on branch `claude/boop-early-shaky-connections-65352e`, not pushed) · **Live:** 0.2.7 on main

## Where it stands
- This repository is the home of Cache Companions; all work happens here.
- Public at github.com/georgesamuelson/cache-companions (MIT), installable with `/plugin install cache-companions --marketplace georgesamuelson/cache-companions`.
- Working on George's Mac in the CLI (face and timer at the end of the hint line) and in desktop-app local sessions (band above the prompt).
- Cloud sessions run it from the setup script (no UI is drawn there). A resumed cloud container keeps the version it already has; a fresh one fetches the latest.

## Waiting on
- George: a 10-minute live check of 0.2.4–0.2.6 on usage credits (timer at 5:00, boops a few cents each, "Last turn: served from cache").
- George: rescue photos for the README.
- George: turn on Settings → Sponsorships in the GitHub repo if the Sponsor button doesn't show.

## Next
Release 0.2.8 (boop early on shaky connections, failed-boop fix) on George's word. Then v0.3: update notice first, then the 5-minute heads-up and plan usage, then band buttons, then `/boop show` and scores.

Earlier plan, still the list: v0.3 (see ROADMAP.md): the "game" (`/boop show`, personal bests, milestones, warm streak); Compact / Handoff buttons; plan usage beside the timer; a 5-minute warning; a daily update notice. Later: research a port to the Pi coding agent.

## Known limits
- Claude Code draws no plugin UI in cloud sessions.
- The desktop app's `/` menu doesn't list `/boop`; typing it in full works.
- Usage credits are inferred from plan usage at 100%; backed by two self-checks.
