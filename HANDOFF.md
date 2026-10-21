# Handoff: start here

**Last session:** 2026-10-16 → 10-18 (cloud), built and released v0.1–0.2.7. **Next session:** say "resume" or "read the handoff".

## On "resume", do this first
1. Read this file, then `STATUS.md`, `ROADMAP.md`, `AGENTS.md`, `CHANGELOG.md`.
2. `git pull`, then run `claude plugin validate .` and `claude plugin test .` to confirm a clean start.
3. Tell George in three lines: the version, what's waiting on him, and the first v0.3 step below. Then start on it unless he says otherwise.

## Where it stands
- **Home:** this repository is the home of Cache Companions; all work happens here.
- **v0.2.7, public** at github.com/georgesamuelson/cache-companions (MIT). 38 tests pass.
- **George's Mac:** installed for the user (CLI + desktop-app local sessions). Update with `claude plugin marketplace update cache-companions && claude plugin update cache-companions@cache-companions`, then `/reload-plugins` or a new session.
- **Cloud:** the environment setup script clones this repo and loads it from the folder; fresh containers get the latest, resumed ones keep their version. No UI is drawn in cloud sessions.

## Waiting on George
- 10-minute live check on usage credits: timer 5:00, boops a few cents each, `/boop stats` "Last turn: served from cache".
- Rescue photos for the README; fill his Buy Me a Coffee page from `docs/buymeacoffee-page.md`; turn on repo Settings → Sponsorships if the button doesn't show.

## v0.3 build order (agreed)
1. **Update notice:** daily read of `.claude-plugin/plugin.json` on GitHub (raw), one toast when newer, `/boop update`, `/boop updates off`; README privacy note.
2. **`/boop show off|percent|saved|tokens|streak`:** one figure after the timer (off by default).
3. **Scores:** money saved as the headline; personal bests per day/week; milestones (1M/10M tokens, $10/$100) with the happy face and one toast; warm streak counting only turns George came back to himself. Listed in `/boop stats`; tidy stats wording (one "at API prices", "1 turn").
4. **Band buttons:** Compact when > 400k; Handoff and Clear & Continue; plan usage beside the timer; a heads-up about 5 minutes before an hour window expires.
5. Release as 0.3.0: version, CHANGELOG, STATUS, README; push.

## Things learned the hard way
- The window must follow Claude Code's rules (1 h in plan, 5 min on credits); a learned 60 min cost real credits in rebuilds. Keep the two self-checks.
- Claude Code draws a log line without line breaks; keep `$.ui.log` text to one line.
- Claude Code adds ` · ` before a hint-line tail; don't add another.
- `$.session.identity` is refused to installed plugins; tell subscriptions by `rateLimits`.
- A Pane opened in a cloud session isn't drawn; fall back to text.
- GitHub repo creation isn't available to Claude's GitHub app; George creates repos himself.
