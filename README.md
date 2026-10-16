# Cache Companions

**Feed your cache. Save your tokens.**

A tiny animal for Claude Code that watches your prompt cache. It gets hungry before the cache expires and keeps it warm while you're away (auto-boop), so coming back doesn't cost you a full re-read of the conversation. It also estimates what the cache saved you.

```
auto mode on (shift+tab to cycle) · ← 1 agent · ʕ•ᴥ•ʔ 3:42↻
```

## Why I made this

I'm in and out of meetings and calls all day, and I use Claude a lot, subscription and overage both. Every time I stepped away long enough for the cache to expire, my next message paid to re-read the whole conversation. So I made something to keep it warm for me.

I love animals. I've always had a dog, and over the past eight years I've gotten into rescuing cats too. So I had a little fun with it and made the helper an animal. You boop it to feed it.

## Help the animals

Cache Companions is free. Away from the keyboard I rescue animals: I put out food for stray and feral cats, get them healthy, foster them, and find them homes, or a working life on a farm for the ones who'll never be lap cats. I've rescued more than 20 cats so far, all self-funded.

If this saves you some money and you'd like to pass a little on, anything you send goes to food, vet care and fostering, with a thank-you from me. No pressure at all; using it, starring the repo or telling a friend helps too.

- ☕ Buy me a coffee: [buymeacoffee.com/georgesamuelson](https://buymeacoffee.com/georgesamuelson)
- Venmo: [@georgesamuelson](https://venmo.com/u/georgesamuelson)
- Instagram: [@georgesamuelson](https://instagram.com/georgesamuelson)
- X / Twitter: [@georgesamuelson](https://x.com/georgesamuelson)
- Website: [georgesamuelson.com](https://georgesamuelson.com)

## Easy mode (the defaults)

Out of the box it's set up so you don't have to think about it:

- **Auto-boop is on**, with no time limit. It keeps the cache warm for as long as you're away. Turn it off with `/boop auto off`, or set a limit with `/boop away 60` or `/boop night` (8 hours).
- **The cache window is detected** (5 minutes or an hour), so the timer is right without a setting.
- **The bear, text faces, sound off.** Change any of it with `/boop settings`.

## Set it up

### 1. Terminal (CLI)

At the prompt of a Claude Code terminal session:

```
/plugin install cache-companions --marketplace georgesamuelson/cache-companions
```

Answer `y` to add the marketplace, then press Enter for "Install for you (user scope)". Or from a shell:

```sh
claude plugin install cache-companions --marketplace georgesamuelson/cache-companions
```

Start a new session. After your first reply the animal and timer show at the end of the line under the prompt.

### 2. Desktop app

The same install covers the desktop app's Code tab, for sessions that run **on your computer**. Then:

1. Quit and reopen the app.
2. Start a new session and set the box above the prompt to **This computer**, not a cloud environment.
3. Send a message. The band shows above the prompt: the animal, a countdown bar, the time left and the Boop button.

To install from the app itself: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `georgesamuelson/cache-companions`, then **Add plugin**.

The app ships its own copy of Claude Code, which must be 2.1.286 or later; `/status` shows it. If the app makes a working copy of a big project folder and runs out of disk, pick a smaller folder: the plugin works in any folder.

### 3. Cloud sessions (claude.ai/code)

Claude Code runs the plugin in cloud sessions (auto-boop, `/boop`, `/boop stats`) but doesn't draw plugin UI there, so you won't see the animal. Each cloud session starts in a fresh container, so add this to the cloud environment's setup script (environment settings, then **Setup script**):

```bash
# Cache Companions (never blocks the session)
git clone -q --depth 1 https://github.com/georgesamuelson/cache-companions.git ~/.claude/cache-companions 2>/dev/null || git -C ~/.claude/cache-companions pull -q || true
python3 - <<'PY' || true
import json, os
p = os.path.expanduser('~/.claude/settings.json')
s = json.load(open(p)) if os.path.exists(p) else {}
s.setdefault('env', {})['CLAUDE_CODE_PLUGIN_DIRS'] = os.path.expanduser('~/.claude/cache-companions')
json.dump(s, open(p, 'w'), indent=2)
PY
```

New cloud sessions pick it up from their first message. Settings and totals start fresh in each one.

### Updating

```sh
claude plugin marketplace update cache-companions && claude plugin update cache-companions@cache-companions
```

Then start a new session. Cloud sessions get the latest version on their own.

### Doesn't show up?

- **In a cloud session:** expected; see above.
- **`/boop` isn't in the `/` menu in the desktop app:** type `/boop help` in full and press Enter.
- **Installed but not loading:** load it straight from a folder instead. Clone this repository, add `{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/Users/YOU/cache-companions" } }` to `~/.claude/settings.json` (merge into your `env` block), uninstall the plugin copy so it doesn't load twice, and restart Claude Code.

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
| `/boop auto on` · `off` | Turns auto-boop on or off. It's on by default. |
| `/boop sound on` · `off` | Plays one soft sound per hungry spell. It's off by default. |
| `/boop big keep` · `stop` | Whether auto-boop keeps going on conversations over `maxContextTokens`. `keep` is the default. |
| `/boop away off` · `60` · `120` | How long auto-boop keeps the cache warm after your last turn, in minutes. `off` (no limit) is the default. |
| `/boop night` | Turns auto-boop on and keeps the cache warm through the night (8 hours), then lets it go. |
| `/boop window auto` · `5` · `60` | Sets the cache window in minutes. `auto` (the default) detects it. |
| `/boop stats` | Shows session and all-time savings. |
| `/boop price <model> <input> <write5m> <write1h> <read> <output>` | Overrides one model's prices, in dollars per million tokens, e.g. `/boop price opus-5-5 4 5 8 0.2 20`. |
| `/boop price reset` | Goes back to the built-in prices. |
| `/boop about` | Why this exists, and the animals it helps. |
| `/boop help` | Lists the commands. |

Settings and all-time totals are kept across sessions and shared by every session on the same machine, CLI and desktop app alike: a change in one shows in the others within about 10 seconds. Cloud sessions keep their own. Two limits live in the same settings: `maxAwayMinutes` (default 0, no limit) and `maxContextTokens` (default 400,000).

## How a boop works

A boop re-sends the conversation Claude Code last sent, which is already in the cache, with one extra line: `boop, reply with one word`. The reply is thrown away. Nothing is added to the chat, and Claude's view of the conversation doesn't change. During a boop Claude can't use any tools.

The cache-read refreshes the cache's lifetime, so the countdown starts again. A boop costs a cache read of the conversation plus a few tokens. It only runs when Claude is idle.

**Auto-boop** boops when about 30 seconds of the window are left. It stops:

- only if you set a limit. By default it keeps going for as long as you're away. `/boop away 60` (or `120`) stops it that many minutes after your last turn, and `/boop night` keeps it warm through the night (8 hours) and then lets go. When it stops it shows a toast and the animal goes cold; your next prompt starts it again.

**Missed boops.** If an auto-boop finds the cache already gone (it paid to rebuild), auto-boop pauses until your next message instead of paying again.

**Big conversations.** When a conversation passes `maxContextTokens` (default 400,000), a toast says once how big it is and what each turn costs to re-read, and suggests `/compact`. Auto-boop keeps going: keeping a big conversation warm still costs far less than rebuilding it. If you'd rather it stopped, use `/boop big stop`.

**Switching models.** A model can't read another model's cache, so after `/model` the companion shows cold straight away, auto-boop waits, and your next message builds a fresh cache.

**Starting with auto-boop off.** Auto-boop is on wherever nothing is saved yet. To start with it off instead (say, in a cloud setup script), set `CACHE_COMPANIONS_AUTO=0` in the environment or in `env` in `~/.claude/settings.json`.

## How the cache window is found

The countdown follows the rules Claude Code itself uses for the main conversation's cache ([docs](https://code.claude.com/docs/en/prompt-caching)):

- **Subscription, within your plan:** 1 hour.
- **Subscription past its limits, on usage credits:** 5 minutes. Claude Code drops to the shorter, cheaper cache when you go over.
- **API key or cloud provider:** 5 minutes.
- **Overrides,** first match wins: `FORCE_PROMPT_CACHING_5M=1`, `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` or `1h`), the `promptCacheTtl` setting, then `ENABLE_PROMPT_CACHING_1H=1`.

It re-checks every 10 seconds, so the timer switches from 60 to 5 minutes the moment you go onto credits. You can tell you're on credits because Claude Code reports your plan's usage at 100%. Until the first reply it assumes 5 minutes, so the animal gets hungry early, never late. `/boop window 5` or `60` overrides all of this; `/boop stats` says which applies.

**On usage credits,** auto-boop spends real money while you're away, so the companion says so once and suggests `/boop night` or `/boop away 60`.

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
