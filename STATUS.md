# Status

**Last updated:** 2026-10-18 · **Version:** 0.2.7 · **Branch:** main

## Where it stands
- Public at github.com/georgesamuelson/cache-companions (MIT), installable with `/plugin install cache-companions --marketplace georgesamuelson/cache-companions`.
- Working on George's Mac in the CLI (face and timer at the end of the hint line) and in desktop-app local sessions (band above the prompt).
- Cloud sessions run it from the setup script (no UI is drawn there). A resumed cloud container keeps the version it already has; a fresh one fetches the latest.

## Waiting on
- George: a 10-minute live check of 0.2.4–0.2.6 on usage credits (timer at 5:00, boops a few cents each, "Last turn: served from cache").
- George: rescue photos for the README.
- George: turn on Settings → Sponsorships in the GitHub repo if the Sponsor button doesn't show.

## Next
v0.3, the "game" (see AGENTS.md → Next): `/boop show`, personal bests, milestones, warm streak; Compact / Handoff buttons; plan-usage beside the timer; a 5-minute warning.

## Known limits
- Claude Code draws no plugin UI in cloud sessions.
- The desktop app's `/` menu doesn't list `/boop`; typing it in full works.
- Usage credits are inferred from plan usage at 100%; backed by two self-checks.
