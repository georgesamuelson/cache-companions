# Cache Companions

**Feed your cache. Save your tokens.**

A tiny animal that watches Claude Code's prompt-cache countdown. It gets hungry before the cache expires, can keep the cache warm for you (auto-boop), and estimates what the cache saved.

```
auto mode on (shift+tab to cycle) · ← 1 agent · ʕ•ᴥ•ʔ 3:42↻
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cache-companions --marketplace georgesamuelson/cache-companions
```

Answer `y` to add the marketplace, then press Enter for the user scope. From a shell instead:

```sh
claude plugin install cache-companions --marketplace georgesamuelson/cache-companions
```

In the desktop app, where `/plugin` doesn't run, click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `georgesamuelson/cache-companions`, then **Add plugin**.

**Update:** `claude plugin update cache-companions`, then start a new session.

**Doesn't show up?** Claude Code is still rolling out plugins of this kind, and some sessions don't load installed ones yet. Loading it from a folder works everywhere. Clone this repository and point Claude Code at it:

```sh
git clone https://github.com/georgesamuelson/cache-companions.git ~/cache-companions
```

Then add this to `~/.claude/settings.json` (merge it into an `env` block if you already have one), and restart Claude Code:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/Users/YOU/cache-companions" } }
```

Update with `git -C ~/cache-companions pull`.

**Cloud sessions** (claude.ai/code) start in a fresh container each time. Add this to the cloud environment's setup script (environment settings, then Setup script):

```bash
git clone -q --depth 1 https://github.com/georgesamuelson/cache-companions.git ~/.claude/cache-companions 2>/dev/null || git -C ~/.claude/cache-companions pull -q || true
python3 - <<'PY' || true
import json, os
p = os.path.expanduser('~/.claude/settings.json')
s = json.load(open(p)) if os.path.exists(p) else {}
s.setdefault('env', {})['CLAUDE_CODE_PLUGIN_DIRS'] = os.path.expanduser('~/.claude/cache-companions')
json.dump(s, open(p, 'w'), indent=2)
PY
```

Settings and all-time totals start fresh in each cloud session.

## Suggest a change

Ideas, bugs and new animals are welcome: open an issue on this repository. Pull requests are welcome too. Run the checks under **Files** first.

## What the faces mean

The text faces are the default. Switch with `/boop emoji`.

| Mood | When | Bear | Cat | Dog | Emoji (cat / dog / bear) |
|---|---|---|---|---|---|
| Fresh | more than 60% of the window left | `ʕ•ᴥ•ʔ` | `(=^･ω･^=)` | `૮・ᴥ・ა` | 😺 / 🐶 / 🐻 |
| Peckish | 30–60% left; blinks now and then | `ʕ°ᴥ°ʔ` | `(=^°ω°^=)` | `૮°ᴥ°ა` | 😼 / 🐕 / 🐻👀 |
| Hungry | less than 30% left | `ʕ•o•ʔ!` | `(=^･o･^=)!` | `૮・o・ა!` | 🙀 / 🐶❗ / 🐻❗ |
| Just fed | 2 seconds after a turn or a boop | `ʕ^ᴥ^ʔ` | `(=^‿^=)` | `૮^ᴥ^ა` | 😻 / 🐶🦴 / 🐻🍯 |
| Cold | the cache has expired | `ʕ-ᴥ-ʔᶻᶻ` | `(=－ω－=)ᶻᶻ` | `૮-ᴥ-აᶻᶻ` | 😿💤 / 🐕💤 / 🐻‍❄️ |

If your terminal draws the dog's ears `૮ ა` as boxes, use `/boop pup` for `∪・ω・∪`. Some terminals split the polar bear 🐻‍❄️ into two emoji.

- **CLI:** the face and the time left sit at the end of the hint line under the prompt. On a narrow terminal with a long hint line, Claude Code may cut them off. Your own status line stays where it is. `↻` after the time means auto-boop is on.
- **App (desktop, mobile):** a band above the prompt with the face, a countdown bar and a **Boop** button. With auto-boop on, the button reads **↻ Auto-Boop On**, and pressing it turns auto-boop off. Hover over the band for the savings estimate. Tap the face for settings.

## Commands and settings

| Command | What it does |
|---|---|
| `/boop` | Feeds the cache now. It runs in the background and nothing appears in the chat. |
| `/boop settings` | Opens a picker for animal, faces, auto-boop, sound and cache window. |
| `/boop bear` · `cat` · `dog` | Picks the animal. `/boop pup` is a dog for terminals that can't draw `૮ ა`. |
| `/boop text` · `emoji` | Picks the face style. |
| `/boop auto on` · `off` | Turns auto-boop on or off. It's off by default. |
| `/boop sound on` · `off` | Plays one soft sound per hungry spell. It's off by default. |
| `/boop big keep` · `stop` | Whether auto-boop keeps going on conversations over `maxContextTokens`. `keep` is the default. |
| `/boop away 60` · `120` · `off` | How long auto-boop keeps the cache warm after your last turn, in minutes. `off` means no limit. The default is 60. |
| `/boop window auto` · `5` · `60` | Sets the cache window in minutes. `auto` (the default) detects it. |
| `/boop stats` | Shows session and all-time savings. |
| `/boop price <model> <input> <write5m> <write1h> <read> <output>` | Overrides one model's prices, in dollars per million tokens, e.g. `/boop price opus-5-5 4 5 8 0.2 20`. |
| `/boop price reset` | Goes back to the built-in prices. |
| `/boop help` | Lists the commands. |

Settings and all-time totals are kept across sessions and shared by every session on the same machine, CLI and desktop app alike: a change in one shows in the others within about 10 seconds. Cloud sessions keep their own. Two limits live in the same settings: `maxAwayMinutes` (default 60) and `maxContextTokens` (default 400,000).

## How a boop works

A boop re-sends the conversation Claude Code last sent, which is already in the cache, with one extra line: `boop, reply with one word`. The reply is thrown away. Nothing is added to the chat, and Claude's view of the conversation doesn't change. During a boop Claude can't use any tools.

The cache-read refreshes the cache's lifetime, so the countdown starts again. A boop costs a cache read of the conversation plus a few tokens. It only runs when Claude is idle.

**Auto-boop** boops when about 30 seconds of the window are left. It stops:

- once you've been away longer than `maxAwayMinutes` (default an hour; `/boop away 120` for two, `/boop away off` for no limit). It shows a toast and the animal goes cold. Your next prompt starts it again.

**Big conversations.** When a conversation passes `maxContextTokens` (default 400,000), a toast says once how big it is and what each turn costs to re-read, and suggests `/compact`. Auto-boop keeps going: keeping a big conversation warm still costs far less than rebuilding it. If you'd rather it stopped, use `/boop big stop`.

## How the cache window is found

The countdown needs to know whether the cache lasts 5 minutes or an hour. With `/boop window auto` it uses the first of these that it has:

1. **What Claude Code reports.** Three reports carry it:
   - a model switch (Claude Code states the window)
   - resuming a session (Claude Code says whether it thinks the cache lapsed)
   - a subagent's reply (its cache writes are split into 5-minute and 1-hour)
2. **What it learned from use.** A turn that starts more than 5 minutes after the cache was last fed, and still reads most of its prompt from cache, proves the hour window. The answer is saved per billing type (subscription or API), so the learning happens once.
3. **Otherwise 5 minutes.** The animal gets hungry early, never late.

`/boop stats` says which of these it is using.

## How the savings estimate works

Everything is labelled an estimate. It comes from the token counts Claude Code reports for each turn: input, cache read, cache write and output tokens, plus the model that answered.

- **Per turn:** saved = cache-read tokens × (input price − cache-read price).
- **Boops:** each boop's cost is its own usage, priced the same way. A boop pays off only when your next real turn comes after the window would have closed without it. In that case the boop prevented a rebuild: that turn's cache-read tokens × (cache-write price − cache-read price). `/boop stats` shows the boops' cost, what they prevented, and the net.
- **API users** see dollars.
- **Subscribers** don't pay per token. A session counts as a subscription when Claude Code reports usage-limit windows for it, which API keys don't have. They see tokens and the share of input served from cache, and dollar figures only as "≈ $X at API prices".
- **Prices** are Anthropic's API list prices, checked against [the pricing page](https://platform.claude.com/docs/en/about-claude/pricing) on 2026-10-16 (`hooks/prices.ts`). Haiku 5.5's higher rate above 100,000 prompt tokens is included. Fast mode, batch, data-residency and cloud-provider pricing are not. Override any model with `/boop price`. A model that isn't in the table shows tokens only.

## Privacy

Cache Companions reads the token counts Claude Code already reports. It sends nothing anywhere. Its settings and totals stay in Claude Code's local plugin store on your machine. A boop is a normal request to the model you're already using, over Claude Code's own connection.

## Sound

`sounds/hungry.wav` is original and under the same MIT licence as the code: a soft two-note chime synthesized from sine waves by `sounds/make-hungry.py`, with no samples or third-party audio. Claude Code plays plugin sounds with `afplay` on macOS. Linux and Windows terminals play nothing.

## Files

```
.claude-plugin/plugin.json        manifest
.claude-plugin/marketplace.json   lets /plugin install find it
hooks/hooks.json                  names the hooks module
hooks/register.tsx                hooks: countdown, boops, status line, band, /boop
hooks/core.ts                     the rules as plain functions (moods, window, auto-boop, savings)
hooks/prices.ts                   API price table
types/index.d.ts                  types and the plugin's state contract
tests/*.test.ts(x)                claude plugin test
sounds/                           hungry.wav and the script that made it
```

To check it after a change:

```sh
claude plugin validate plugins/cache-companions
claude plugin test plugins/cache-companions
```

Type-check with `tsc -p plugins/cache-companions` once Claude Code has loaded the plugin, which lays its types in `.claude-plugin/types/`.

## Licence

MIT. See `LICENSE`.
