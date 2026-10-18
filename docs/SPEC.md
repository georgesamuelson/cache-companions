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
- **Auto-boop:** on by default, fires about 30 s before expiry, no time limit unless set (`/boop away`, `/boop night`). Pauses after a boop that had to rebuild, and after a model switch, until the next message.
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
