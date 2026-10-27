# Boop early on shaky connections

*Idea / design note. George, 10/26/2026. Not built yet. See ROADMAP → "Next: boop early on shaky connections".*

## The problem (field report)

On the road with a weak connection, several Claude Code panes went cold in one evening: a clips worker, the coordinator, and next the rescue-kits pane. Each cold pane pays a full rebuild of a long conversation on its next turn, which is the exact cost Cache Companions exists to prevent.

Why it happened:
- Each pane keeps its **own countdown and window** (5 min or 1 hour, from Claude Code's rules). That part works.
- The **auto-boop fires about 30 s before expiry.** If that one boop fails or is slow (dropped Wi-Fi, a tunnel, a phone hotspot hiccup), there is no time left to try again. The window closes and the cache is gone.
- Nothing tells the person it failed, so they find out from a slow, expensive first turn.

## What we want

Keep the cache alive even when the connection is unreliable, by booping **earlier**, **retrying**, and **checking the connection**, and by saying clearly when it didn't work.

## Proposal

### 1. Boop early (a share of the window, not the last 30 s)
- First boop at a set share of the window. Default proposal: **80%**.
  - 60-min window → first boop at about **48 min** (12 min of room to retry).
  - 5-min window → first boop at about **4 min** (1 min of room).
- Setting: `/boop early 80` (percent of the window). `/boop early off` = today's behavior (about 30 s before expiry).
- Per pane: each pane uses its own window and countdown, as now.

### 2. Retry until it lands
- If a boop fails (network error, timeout, error response, or no usage returned), retry with backoff: **30 s → 60 s → 2 min → …** until it succeeds or the window ends.
- A boop counts as **done only when the response comes back with cache-read usage** (proof the cache was refreshed). Anything else = not done, keep retrying.
- After a success, the countdown restarts from that boop, as now.

### 3. Check the connection first
- Before a boop (and before each retry), do a cheap reachability check (for example, a HEAD/DNS check to the API host).
- If offline: don't burn the attempt. Wait, and boop **as soon as the connection is back**, as long as there is window left.
- Optional: listen for the OS "network changed / back online" event and try right away.

### 4. Say when it failed
- Band states: **"boop failed, retrying"**, **"offline, will retry"**, **"cache likely cold"** (window ended without a successful boop).
- One toast when a pane's cache is likely cold, so the person knows before they come back.
- `/boop stats` could count failed and retried boops, and rebuilds that still happened.

### 5. Remote / travel mode (one switch)
- `/boop remote` turns on: boop early (proposal **70%**, a bit earlier than the 80% default), retries, connection checks, and failure toasts.
- Shows **"remote"** in the band so it's obvious it's on. `/boop remote off` returns to normal.
- Could also be auto-suggested if several boops in a row fail.

### 6. Many panes at once
- Several panes on one weak connection shouldn't all retry at the same second.
- In remote mode, **stagger** first boops and retries across panes by a few seconds each (small random jitter).
- Optional: a priority order (for example the coordinator first), so the most expensive conversation is protected first.

## Cost trade-off

Booping earlier means a few extra boops per hour per pane (a few cents at API prices). A cold rebuild of a long conversation (hundreds of thousands of tokens) costs far more. For long-running panes on a shaky connection, booping early is clearly worth it. The savings display should show both sides honestly (extra boops vs. rebuilds prevented).

## Settings summary (proposed)

| Command | What it does |
|---|---|
| `/boop early 80` | First boop at 80% of the window (any percent) |
| `/boop early off` | Back to the last-30-seconds behavior |
| `/boop remote` | Early (70%) + retries + connection checks + failure toasts + staggering |
| `/boop remote off` | Back to normal |

## Open questions

1. Best default: 80% for everyone, or keep 30 s by default and only go early in remote mode?
2. How long should backoff go before giving up? Until the window ends, or a fixed number of tries?
3. Is there a reliable "back online" signal in the hook environment, or poll every few seconds?
4. Should the band show the time left until the next planned boop, not just until expiry?
5. Does a boop that fails partway still refresh the cache server-side? (If yes, retries are cheaper than they look.)

## How to test

1. Set a 5-min window, turn on `/boop early 80`, and confirm the first boop fires at about 4:00.
2. Turn Wi-Fi off just before the boop: confirm "offline, will retry" shows, and the boop fires after Wi-Fi comes back within the window.
3. Leave Wi-Fi off past the window: confirm "cache likely cold" and one toast.
4. Three panes in remote mode: confirm boops are staggered, not simultaneous.
5. Check `/boop stats` counts the failures and retries.

## Your notes

*(George: add thoughts here.)*

-
