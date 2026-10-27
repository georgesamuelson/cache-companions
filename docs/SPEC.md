# Cache Companions: spec

**Tagline:** Feed your cache. Save your tokens. · **Command:** `/boop` · Approved by George Samuelson, 2026-10-16.

A small animal that watches the prompt-cache countdown, gets hungry before the cache expires, keeps it warm while you're away, and estimates what the cache saved. "Boop" as a product name is taken (a Mac dev scratchpad) and "Cache Buddy" is a WordPress plugin, hence the name.

## Faces
Text faces by default, emoji as an option. Mouth opens and "!" when hungry; eyes shut and "ᶻᶻ" when cold. No words beside the face. The README has the full table.

## Where it shows
- **CLI:** face and `m:ss` at the end of the hint line under the prompt, `↻` after the time while auto-boop is on.
- **Desktop app:** a band above the prompt: face, countdown bar, time left, Boop button (reads "↻ Auto-Boop On" while on; pressing it turns auto-boop off). Hover for savings; tap the face for settings.
- **Cloud:** runs, draws nothing.
- At most one update a second; a blink every few seconds at most.

## Behaviour
- **Countdown** from each finished turn or boop. **Window**: Claude Code's own rules (see AGENTS.md), with `/boop window` as an override.
- **Boop:** a background fork of the cached conversation asking for one word; nothing in the chat, no tools, only when idle.
- **Auto-boop:** on by default, fires about 30 s before expiry, no time limit unless set (`/boop away`, `/boop night`). Pauses after a boop that had to rebuild, after one Claude refused, and after a model switch, until the next message.
- **A boop counts only when a cache read comes back** (on any reply, even a failed or cut one). A failed boop leaves the countdown alone; the clock restarts from when a boop that landed was sent.
- **Retries:** after a failed boop, 30 s → 60 s → 2 min (repeating), or half the time left when that's sooner, at least 5 s, until the window's last 3 s. No separate connection check: the boop's own failure says offline, busy or refused. A boop with no answer after 20 s counts as failed for timing; at most two out.
- **Boop early** (`/boop early 10–95`, off by default): the first auto-boop at that share of the window, never later than 30 s before expiry.
- **Remote** (`/boop remote`, off by default): boop early at 70% unless set, retries, and a 0–10 s stagger per pane, drawn once per window and per retry.
- **Saying so:** band and CLI words `retrying`, `offline`, `likely cold`, `remote`; one toast per window that ends after failed boops; `/boop stats` counts failed boops and windows lost (a real turn that rebuilt after them). Settings are machine-wide; retry state is per pane.
- **Big conversations:** keep booping; one `/compact` tip past 400k tokens.
- **Sound:** off by default; one original chime per hungry spell.
- **Settings remembered** on the machine, shared by CLI and desktop sessions.

## Savings estimate (always "estimate")
- Per turn: cache-read tokens × (input price − cache-read price).
- Boops: cost from their own usage; prevented = the rebuild the next turn would have paid if it came after the window; net shown.
- API users see dollars; subscribers see tokens and dollars only "at API prices". Prices from Anthropic's pricing page, editable with `/boop price`.

## Guardrails
- Reads only the token counts Claude Code reports; sends nothing anywhere.
- Original or CC0 sounds only, licence noted.
- Never presents an estimate as a bill.
