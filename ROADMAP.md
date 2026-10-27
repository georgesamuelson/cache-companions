# Roadmap and to-dos

Ideas from anyone go in GitHub Issues; this file is the working list. Tick items off and move them to `CHANGELOG.md` when they ship.

## 0.2.8: boop early on shaky connections (built, release waiting on George)
See `docs/boop-early-shaky-connections.md`.
- [x] Failed boops no longer count as fed; the countdown restarts from when a boop was sent
- [x] Retry with backoff until the window ends; done only when a cache read comes back
- [x] Failure kinds (offline, busy, refused) in place of a separate connection check
- [x] `/boop early <percent>` and `/boop early off` (off by default)
- [x] Band and CLI words, one "likely cold" toast, failed boops in `/boop stats`
- [x] `/boop remote` and `/boop remote off`, with a per-pane stagger
- [x] Live test steps 1–2 on George's Mac (boop at 4:00 with early 80; offline, then landed when Wi-Fi came back)
- [x] Fixed from the live test: conversation size from summed turn usage; garbled timer in the Terminal panel
- [ ] Live test step 4, three panes in remote mode (George; step 3 is covered by the automated test)
- [ ] Later, maybe: a priority order across panes (the coordinator first); suggest `/boop remote` after several failures in a row (the cold toast does now)

## v0.3: the game (not built yet)
- [ ] `/boop show off|percent|saved|tokens|streak`: one figure after the timer (off by default)
- [ ] Money saved as the headline score (tokens for anyone who prefers)
- [ ] Personal bests per day and per week
- [ ] Milestones: 1M and 10M tokens from cache, $10 and $100 saved; happy face plus one toast
- [ ] Warm streak, counting only turns where you came back yourself
- [ ] `/boop stats` lists bests and milestones; tidier wording (one "at API prices", "1 turn")

## v0.3: band and buttons
This is v0.3 step 4 in `HANDOFF.md`, including the Handoff and Clear & Continue buttons.
- [ ] Compact button in the band when a conversation passes 400k
- [ ] Handoff and Clear & Continue buttons
- [ ] Plan usage (5-hour and weekly) beside the timer
- [ ] A heads-up about 5 minutes before the cache expires (1-hour window)

## v0.3: update notice
- [ ] Once a day, read the latest version number from this repo on GitHub; if it's newer than the one running, show one toast: "Cache Companions X is out" with the update line
- [ ] `/boop update` shows the one-line update command; `/boop updates off` turns the check off
- [ ] Update the README privacy note: the only network call is reading that public version number

## Later: other agents
- [ ] Port the rules in `hooks/core.ts` (countdown, window, savings) to other coding agents with plugin systems, starting with the Pi coding agent if its extension API exposes per-turn token usage and a UI slot. Research before building.

## Support and the animals
- [x] README "Why I made this" and "Help the animals"
- [x] Buy Me a Coffee, Venmo, Instagram, X, website links; Sponsor button file
- [ ] Turn on Settings → Sponsorships in the repo if the button doesn't show (George)
- [ ] Rescue photos in the README (George to send)
- [ ] Fill in the Buy Me a Coffee page from `docs/buymeacoffee-page.md` (George)

## Checks waiting on George
- [ ] 10-minute live check on usage credits: timer 5:00, boops a few cents each, "Last turn: served from cache"
- [ ] Desktop band and settings look right after 0.2.0+

## Ideas, not planned yet
- More animals (suggestions welcome)
- A gentle sound option per animal
