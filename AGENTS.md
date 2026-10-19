# Cache Companions: notes for coding agents

When George says "resume" or "read the handoff", follow `HANDOFF.md`. Otherwise read this first, then `STATUS.md` (where things stand), `ROADMAP.md` (to-dos and ideas), `docs/SPEC.md` (what it is and why) and `CHANGELOG.md` (what changed). Claude Code reads this file through `CLAUDE.md`; Codex and other agents read it directly.

A Claude Code mod (a plugin with a hooks module): a small animal that watches the prompt-cache countdown, keeps the cache warm while you're away (auto-boop), and estimates what the cache saved. Owner: George Samuelson. Public, MIT.

## Layout
- `hooks/core.ts`: every rule as plain functions (faces, countdown, window rules, auto-boop, savings, words). Put logic here so tests can call it.
- `hooks/register.tsx`: the glue: hooks, `/boop`, the CLI hint-line entry, the desktop band, the settings pane.
- `hooks/prices.ts`: API list prices, checked against platform.claude.com/docs/en/about-claude/pricing (date in the file). Re-check from the page before changing; never from memory.
- `types/index.d.ts`: types and the `$.state` contract. `tests/`: `claude plugin test`.

## Checks before every push
```
claude plugin validate .
claude plugin test .
tsc -p .        # once Claude Code has loaded the mod and laid .claude-plugin/types/
```
In a fresh checkout without `.claude-plugin/types/`, type-check with a tsconfig outside the repo whose `files` names the plugin-authoring skill's `types/claude-code.d.ts`.

## Releasing
1. Bump `version` in `.claude-plugin/plugin.json` (installs only update when it changes).
2. Update `README.md` where behaviour changed.
3. Commit and push to `main`.
4. Users: `claude plugin marketplace update cache-companions && claude plugin update cache-companions@cache-companions`, then `/reload-plugins` (local) or a new session. Cloud sessions fetch the latest from their setup script when a fresh container starts (not when a session resumes).

## Where it runs (local vs cloud)
| | CLI (George's Mac) | Desktop app, local session | Cloud session (claude.ai/code) |
|---|---|---|---|
| Shows | face + timer at the end of the hint line | band above the prompt | nothing drawn (hooks still run) |
| `/boop settings` | settings pane | settings pane | settings listed as text |
| Settings and totals | shared with the desktop app on the same Mac | shared with the CLI | only that container; fresh ones start in easy mode |
| Install | `/plugin install … --marketplace georgesamuelson/cache-companions` (user scope) | same install | setup script clones this repo into `~/.claude/cache-companions` and sets `CLAUDE_CODE_PLUGIN_DIRS` |
| Update | `claude plugin marketplace update cache-companions && claude plugin update cache-companions@cache-companions`, then `/reload-plugins` per open session | same, then a new session | automatic in a fresh container; a resumed container keeps its version; `/reload-plugins` isn't available |

Gotchas: the desktop app's `/` menu doesn't list `/boop` (type it in full); a desktop local session on a big folder may ask for tens of GB for a worktree (pick a small folder; the plugin works anywhere); never load the plugin both installed and via `CLAUDE_CODE_PLUGIN_DIRS` on one machine (it runs twice).

## Decisions so far (keep unless George says otherwise)
- Text faces by default; bear default; animals bear, cat, dog (+ `pup` fallback). Peckish has `°` eyes and blinks.
- A boop is `$.model.fork` with "boop, reply with one word": nothing in the chat, no tools.
- Easy mode: auto-boop on by default with no time limit (`/boop away 60|120`, `/boop night` = 8 h). `CACHE_COMPANIONS_AUTO=0` starts it off.
- Window follows Claude Code's documented rules (code.claude.com/docs/en/prompt-caching): 1 h on a subscription within plan, 5 min on usage credits / API key / cloud provider, env and `promptCacheTtl` overrides. Credits are inferred from plan usage ≥ 100% (not documented as a signal), so two checks back it up: a rebuild where the hour said warm switches to 5 min, and an auto-boop that finds the cache gone pauses auto-boop until the next message.
- A model switch shows cold and stops boops until the next message.
- Big conversations (> 400k) keep auto-booping; one toast suggests `/compact`.
- Subscribers see dollars only as "at API prices".
- CLI: entry at the end of the hint line (`PromptHint` tail; Claude Code adds the ` · `). Desktop: band above the prompt. Cloud sessions run the mod but draw no UI.
- Settings and all-time totals are shared by every session on a machine; sessions add their own part to stored totals.

## Next (v0.3, planned with George)
- `/boop show off|percent|saved|tokens|streak`: one figure after the timer.
- Beat your own score: money saved as the headline, personal bests per day/week, milestones (1M/10M tokens, $10/$100), warm streak counting only turns you came back to.
- Ideas from Nate's Cache Keeper post: band buttons for Compact and Handoff / Clear & Continue, plan-usage limits beside the timer, a heads-up about 5 minutes before expiry.
- Update notice: once a day read the latest version from this repo on GitHub; if newer, one toast with the update line; `/boop update`, `/boop updates off`; README privacy note to say this read is the only network call.
- Rescue photos in the README "Help the animals" section when George sends them.

## Later
- Port the rules in `hooks/core.ts` to other coding agents with plugin systems, starting with the Pi coding agent, after checking its extension API exposes per-turn token usage and a UI slot.
