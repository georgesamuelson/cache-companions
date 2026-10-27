// The plugin's logic as plain functions: no `$`, no clock, no I/O, so the
// tests can call every rule directly. register.tsx is the glue.
import type {
  Animal,
  BillingMode,
  BoopFailure,
  BoopReply,
  FaceStyle,
  Mood,
  Note,
  Price,
  Runtime,
  Settings,
  Totals,
  TtlSetting,
  TtlSource,
  Usage,
} from '../types'
import { DEFAULT_PRICES, LONG_PROMPT_PRICES } from './prices'

export const DEFAULT_SETTINGS: Settings = {
  animal: 'bear',
  style: 'text',
  ttl: 'auto',
  // Easy mode: keep the cache warm out of the box.
  auto: true,
  maxAwayMinutes: 0,
  maxContextTokens: 400_000,
  stopWhenBig: false,
  sound: false,
  // Boop early is off: the first auto-boop comes about 30 s before expiry, as before.
  earlyPercent: null,
  remote: false,
  prices: {},
}

/** `/boop night`: keep the cache warm overnight, then let it go. */
export const NIGHT_MINUTES = 8 * 60

/** Auto-boop fires once this little of the window is left. */
export const AUTO_BOOP_AT_MS = 30_000
/** ...but not this close to expiry, in case the boop is slow to land. */
export const AUTO_BOOP_LATEST_MS = 3_000
export const FED_MS = 2_000
/** `/boop remote` boops at this share of the window unless `/boop early` says otherwise. */
export const REMOTE_EARLY_PERCENT = 70
/** Waits between retries of a failed boop; the last one repeats. */
export const RETRY_STEPS_MS = [30_000, 60_000, 120_000] as const
export const RETRY_FLOOR_MS = 5_000
/** A boop with no answer after this long stops holding up retries (a fork has no timeout). */
export const BOOP_HUNG_MS = 20_000
/** At most this many boops out at once, a hung one included. */
export const MAX_BOOPS_OUT = 2
/** Remote mode moves each pane's boops by up to this much, so panes don't all try at once. */
export const STAGGER_MS = 10_000
export const BOOP_PROMPT = 'boop, reply with one word'

// ---------- faces ----------

type FaceSet = { fresh: string; peckish: string; blink: string; hungry: string; fed: string; cold: string }

export const TEXT_FACES: Record<Animal, FaceSet> = {
  bear: { fresh: 'ʕ•ᴥ•ʔ', peckish: 'ʕ°ᴥ°ʔ', blink: 'ʕ-ᴥ-ʔ', hungry: 'ʕ•o•ʔ!', fed: 'ʕ^ᴥ^ʔ', cold: 'ʕ-ᴥ-ʔᶻᶻ' },
  cat: {
    fresh: '(=^･ω･^=)',
    peckish: '(=^°ω°^=)',
    blink: '(=^－ω－^=)',
    hungry: '(=^･o･^=)!',
    fed: '(=^‿^=)',
    cold: '(=－ω－=)ᶻᶻ',
  },
  dog: { fresh: '૮・ᴥ・ა', peckish: '૮°ᴥ°ა', blink: '૮-ᴥ-ა', hungry: '૮・o・ა!', fed: '૮^ᴥ^ა', cold: '૮-ᴥ-აᶻᶻ' },
  // The dog for terminals that cannot draw ૮ ა.
  pup: { fresh: '∪・ω・∪', peckish: '∪°ω°∪', blink: '∪-ω-∪', hungry: '∪・o・∪!', fed: '∪^ω^∪', cold: '∪-ω-∪ᶻᶻ' },
}

const DOG_EMOJI = { fresh: '🐶', peckish: '🐕', hungry: '🐶❗', fed: '🐶🦴', cold: '🐕💤' }
export const EMOJI_FACES: Record<Animal, Omit<FaceSet, 'blink'>> = {
  bear: { fresh: '🐻', peckish: '🐻👀', hungry: '🐻❗', fed: '🐻🍯', cold: '🐻‍❄️' },
  cat: { fresh: '😺', peckish: '😼', hungry: '🙀', fed: '😻', cold: '😿💤' },
  dog: DOG_EMOJI,
  pup: DOG_EMOJI,
}

/** Peckish text faces blink for one second in every five. */
export function faceFor(animal: Animal, style: FaceStyle, mood: Mood, now: number): string {
  const key = mood === 'idle' ? 'fresh' : mood
  if (style === 'emoji') return EMOJI_FACES[animal][key]
  const set = TEXT_FACES[animal]
  if (key === 'peckish' && Math.floor(now / 1000) % 5 === 0) return set.blink
  return set[key]
}

// ---------- the countdown ----------

export function moodOf(share: number): 'fresh' | 'peckish' | 'hungry' {
  if (share > 0.6) return 'fresh'
  if (share >= 0.3) return 'peckish'
  return 'hungry'
}

export type Countdown = { mood: Mood; leftMs: number | null; fraction: number | null }

export function countdown(rt: Pick<Runtime, 'lastFedAt' | 'fedUntil'>, windowMs: number, now: number, isBusy: boolean): Countdown {
  if (rt.lastFedAt === null || isBusy) return { mood: 'idle', leftMs: null, fraction: null }
  const leftMs = Math.max(0, windowMs - (now - rt.lastFedAt))
  const fraction = leftMs / windowMs
  if (now < rt.fedUntil) return { mood: 'fed', leftMs, fraction }
  if (leftMs <= 0) return { mood: 'cold', leftMs: 0, fraction: 0 }
  return { mood: moodOf(fraction), leftMs, fraction }
}

export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const NOTE_SHORT: Record<Note, string> = { retrying: 'retrying', offline: 'offline', 'likely-cold': 'likely cold', remote: 'remote' }
export const NOTE_LONG: Record<Note, string> = {
  retrying: 'boop failed, retrying',
  offline: 'offline, will retry',
  'likely-cold': 'cache likely cold',
  remote: 'remote',
}

/** The CLI status entry: `ʕ•ᴥ•ʔ 3:42`, `↻` after the time while auto-boop is on, then any note. */
export function statusText(face: string, c: Countdown, auto: boolean, note: Note | null = null): string {
  const tail = note ? ` ${NOTE_SHORT[note]}` : ''
  if (c.leftMs === null || c.mood === 'cold') return `${face}${tail}`
  return `${face} ${clockText(c.leftMs)}${auto ? '↻' : ''}${tail}`
}

/** Failing boops say so first; a cold cache after them says "likely cold"; otherwise remote mode shows. */
export function noteFor(a: { failedBoops: number; lastFailure: BoopFailure | null; mood: Mood; remote: boolean }): Note | null {
  if (a.failedBoops > 0 && a.mood !== 'idle') {
    if (a.mood === 'cold') return 'likely-cold'
    return a.lastFailure === 'offline' ? 'offline' : 'retrying'
  }
  return a.remote ? 'remote' : null
}

// ---------- the cache window ----------

/**
 * The window Claude Code itself uses for the main conversation, by its own
 * rules (code.claude.com/docs/en/prompt-caching): an hour on a subscription
 * within its plan, five minutes on usage credits, an API key or a cloud
 * provider; FORCE_PROMPT_CACHING_5M, CLAUDE_CODE_PROMPT_CACHE_TTL, the
 * promptCacheTtl setting and ENABLE_PROMPT_CACHING_1H override, in that order.
 */
export type WindowRuleInputs = {
  force5m: string | undefined
  envTtl: string | undefined
  settingTtl: unknown
  enable1h: string | undefined
  mode: BillingMode
  onCredits: boolean
}

const isOn = (v: string | undefined) => v === '1' || v === 'true'

export function claudeCodeWindow(i: WindowRuleInputs): 5 | 60 {
  if (isOn(i.force5m)) return 5
  const ttl = i.envTtl ?? (typeof i.settingTtl === 'string' ? i.settingTtl : undefined)
  if (ttl === '5m') return 5
  if (ttl === '1h') return 60
  if (isOn(i.enable1h)) return 60
  return i.mode === 'subscription' && !i.onCredits ? 60 : 5
}

/** Your setting wins; otherwise Claude Code's rule; before any reading, five minutes. */
export function resolveWindow(setting: TtlSetting, rule: 5 | 60 | null): { minutes: 5 | 60; source: TtlSource } {
  if (setting !== 'auto') return { minutes: setting, source: 'setting' }
  if (rule !== null) return { minutes: rule, source: 'claude-code' }
  return { minutes: 5, source: 'assumed' }
}

/**
 * A check on the hour window from what a turn actually did: a turn that came
 * more than five minutes after the cache was fed, on the same model, and still
 * had to rebuild, shows the cache was really five minutes.
 */
export function showsShortWindow(windowMinutes: number, gapMs: number | null, sameModel: boolean, u: Usage): boolean {
  if (windowMinutes !== 60 || gapMs === null || !sameModel) return false
  if (gapMs < 5 * 60_000 + 20_000 || gapMs > 60 * 60_000) return false
  return !isCached(u) && u.cache_creation_input_tokens > 1024
}

/** Past 100% of a plan window, a subscription is drawing on usage credits. */
export function isOnCredits(rateLimits: readonly { percentUsed: number }[]): boolean {
  return rateLimits.some(r => r.percentUsed >= 100)
}

/**
 * When a resumed session's cache was last fed: Claude Code says how long ago
 * the last reply was. If it judges the cache lapsed, the time is pushed past
 * any window so the companion shows cold at once.
 */
export function resumedFedAt(now: number, secondsSince: number | undefined, likelyExpired: boolean | undefined): number | null {
  if (secondsSince === undefined || !Number.isFinite(secondsSince) || secondsSince < 0) return null
  const at = now - secondsSince * 1000
  return likelyExpired ? Math.min(at, now - 60 * 60_000 - 1000) : at
}


// ---------- auto-boop ----------

/**
 * How much of the window is left when the first auto-boop fires: about 30 s,
 * or with boop early the rest of the window after that share. Never later
 * than 30 s; the remote stagger moves it earlier.
 */
export function boopStartMs(windowMs: number, earlyPercent: number | null, remote: boolean, jitterMs: number): number {
  const percent = earlyPercent ?? (remote ? REMOTE_EARLY_PERCENT : null)
  const left = percent === null ? AUTO_BOOP_AT_MS : Math.max(AUTO_BOOP_AT_MS, Math.round(windowMs * (1 - percent / 100)))
  return left + (remote ? jitterMs : 0)
}

/**
 * When to try a failed boop again: the next backoff step or half the time
 * left, whichever is sooner, at least 5 s; null when that would land in the
 * window's last 3 s, so it gives up.
 */
export function retryAt(now: number, failures: number, leftMs: number): number | null {
  const step = RETRY_STEPS_MS[Math.min(Math.max(failures, 1), RETRY_STEPS_MS.length) - 1]!
  const wait = Math.max(RETRY_FLOOR_MS, Math.min(step, leftMs / 2))
  return wait > leftMs - AUTO_BOOP_LATEST_MS ? null : now + wait
}

/**
 * What a boop achieved, from its usage alone: a cache read on any reply,
 * even a failed or cut one, means the cache was refreshed. A dropped
 * connection reports usage too, all zeros, so usage alone proves nothing.
 */
export type BoopOutcome = { kind: 'fed' } | { kind: 'rebuilt' } | { kind: 'failed'; why: BoopFailure }

export function boopOutcome(r: BoopReply): BoopOutcome {
  if (r.usage && isCached(r.usage)) return { kind: 'fed' }
  if (r.isAnswered) return { kind: 'rebuilt' }
  // A fork can take more than one step; one before the failure may have written the prefix.
  if (r.usage && r.usage.cache_creation_input_tokens > 1024) return { kind: 'rebuilt' }
  if (r.reason === 'api-error') {
    if (r.status === null || r.status === undefined) return { kind: 'failed', why: 'offline' }
    if (r.error === 'authentication_failed' || r.error === 'invalid_request') return { kind: 'failed', why: 'stopped' }
  }
  return { kind: 'failed', why: 'busy' }
}

export function isBoopHung(startedAt: number | null, now: number): boolean {
  return startedAt !== null && now - startedAt >= BOOP_HUNG_MS
}

export type AutoBoopCheck = {
  settings: Pick<Settings, 'auto' | 'maxAwayMinutes' | 'maxContextTokens' | 'stopWhenBig' | 'earlyPercent' | 'remote'>
  rt: Pick<Runtime, 'contextTokens'>
  /** How long since your last turn ended; null before the first. */
  awayMs: number | null
  leftMs: number | null
  isBusy: boolean
  isBooping: boolean
  windowMs: number
  now: number
  /** No boop before this time (a retry is waiting, or it gave up for this window). */
  retryAt: number | null
  /** This pane's stagger in remote mode. */
  jitterMs: number
}

export type AutoBoopDecision = 'boop' | 'wait' | 'cap' | 'too-big'

export function autoBoop(c: AutoBoopCheck): AutoBoopDecision {
  if (!c.settings.auto || c.isBusy || c.isBooping || c.leftMs === null) return 'wait'
  if (c.leftMs > boopStartMs(c.windowMs, c.settings.earlyPercent, c.settings.remote, c.jitterMs) || c.leftMs < AUTO_BOOP_LATEST_MS) return 'wait'
  if (c.retryAt !== null && c.now < c.retryAt) return 'wait'
  if (c.settings.stopWhenBig && c.rt.contextTokens > c.settings.maxContextTokens) return 'too-big'
  if (c.settings.maxAwayMinutes > 0 && c.awayMs !== null && c.awayMs > c.settings.maxAwayMinutes * 60_000) return 'cap'
  return 'boop'
}

/** A prompt the person typed: the boop streak and its warnings start over. */
export function onRealPrompt(rt: Runtime): Runtime {
  // Failed-boop state clears when that turn completes, after it shows whether the window was lost.
  return { ...rt, boopsInRow: 0, capNotified: false }
}

/** The cache was fed (a turn or a boop that landed): failures start over. */
export const boopsLanded = { failedBoops: 0, lastFailure: null, retryAt: null, coldNotified: false } as const

/**
 * Said once when a conversation grows past maxContextTokens. Keeping it warm
 * is still cheaper than a rebuild, but every turn re-reads all of it.
 */
export function bigNotice(contextTokens: number, price: Price | null, mode: BillingMode): string {
  const perTurn = price ? `, about ${dollars(perM(contextTokens, price.read))} a turn${mode === 'subscription' ? ' at API prices' : ''}` : ''
  return `This conversation is ${tokens(contextTokens)} tokens. Every turn re-reads all of it${perTurn}. /compact would make each turn cheaper. Auto-boop keeps going.`
}

// ---------- savings ----------

export function promptTokens(u: Usage): number {
  return u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
}

/** `claude-opus-5-5-20261001[1m]`, `us.anthropic.claude-opus-5-5-v1:0` → `opus-5-5`. */
export function modelKey(model: string): string | null {
  // Older ids put the version first: claude-3-5-haiku.
  const old = /claude-(\d)-(\d)-(haiku|sonnet|opus)/.exec(model)
  if (old) return `${old[3]}-${old[1]}-${old[2]}`
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2})(?!\d))?/.exec(model)
  if (!m) return null
  return m[3] === undefined ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}-${m[3]}`
}

export function priceFor(model: string | null, prompt: number, overrides: Record<string, Price>): Price | null {
  if (model === null) return null
  const key = modelKey(model)
  if (key === null) return null
  if (overrides[key]) return overrides[key]
  const long = LONG_PROMPT_PRICES[key]
  if (long && prompt > long.over) return long.price
  return DEFAULT_PRICES[key] ?? null
}

const perM = (tokens: number, dollars: number) => (tokens * dollars) / 1_000_000

/** What reading from cache saved on one turn: cache reads × (input − cache read). */
export function turnSavedUsd(u: Usage, price: Price | null): number {
  return price ? perM(u.cache_read_input_tokens, price.input - price.read) : 0
}

/** What one boop cost, from its own usage. */
export function boopCostUsd(u: Usage, price: Price | null, windowMinutes: 5 | 60): number {
  if (!price) return 0
  const write = windowMinutes === 60 ? price.write1h : price.write5m
  return (
    perM(u.input_tokens, price.input) +
    perM(u.cache_read_input_tokens, price.read) +
    perM(u.cache_creation_input_tokens, write) +
    perM(u.output_tokens, price.output)
  )
}

/**
 * What the boops before a real turn prevented: only when that turn came after
 * the window would have closed without them, and then the rebuild it would
 * have paid, the tokens it read from cache written again instead.
 */
export function preventedUsd(u: Usage, price: Price | null, windowMinutes: 5 | 60, gapSinceRealMs: number | null, boopsBefore: number): number {
  if (!price || boopsBefore === 0 || gapSinceRealMs === null) return 0
  if (gapSinceRealMs <= windowMinutes * 60_000) return 0
  const write = windowMinutes === 60 ? price.write1h : price.write5m
  return perM(u.cache_read_input_tokens, write - price.read)
}

export function emptyTotals(): Totals {
  return {
    turns: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    rebuilds: 0,
    savedUsd: 0,
    boops: 0,
    boopCostUsd: 0,
    preventedUsd: 0,
    boopFails: 0,
    lostAfterFail: 0,
  }
}

/** A turn served mostly from cache; one that wrote more than it read rebuilt. */
export function isCached(u: Usage): boolean {
  return u.cache_read_input_tokens > 0 && u.cache_read_input_tokens >= u.cache_creation_input_tokens
}

export function addTurn(t: Totals, u: Usage, saved: number, prevented: number): Totals {
  return {
    ...t,
    turns: t.turns + 1,
    inputTokens: t.inputTokens + promptTokens(u),
    cacheReadTokens: t.cacheReadTokens + u.cache_read_input_tokens,
    cacheWriteTokens: t.cacheWriteTokens + u.cache_creation_input_tokens,
    rebuilds: t.rebuilds + (isCached(u) ? 0 : 1),
    savedUsd: t.savedUsd + saved,
    preventedUsd: t.preventedUsd + prevented,
  }
}

/** Adds two sets of totals, field by field. */
export function sumTotals(a: Partial<Totals> | undefined, b: Totals): Totals {
  const out = emptyTotals()
  for (const k of Object.keys(out) as (keyof Totals)[]) out[k] = (Number(a?.[k]) || 0) + b[k]
  return out
}

export function addBoop(t: Totals, cost: number): Totals {
  return { ...t, boops: t.boops + 1, boopCostUsd: t.boopCostUsd + cost }
}

/** A boop that didn't land: counted apart, its cost (if any came back) still counted. */
export function addFailedBoop(t: Totals, cost: number): Totals {
  return { ...t, boopFails: t.boopFails + 1, boopCostUsd: t.boopCostUsd + cost }
}

/** The window closed after failed boops, and the next real turn did rebuild. */
export function addLostWindow(t: Totals): Totals {
  return { ...t, lostAfterFail: t.lostAfterFail + 1 }
}

/** Said once when a pane's cache likely went cold because its boops didn't get through. */
export function coldNotice(why: BoopFailure | null, remote: boolean): string {
  const how = why === 'offline' ? 'there was no connection' : 'Claude was busy or erroring'
  const tip = remote ? '' : ' /boop remote boops earlier so retries have room.'
  return `Your cache likely went cold: the boops before it expired didn't get through (${how}). Your next message rebuilds it.${tip}`
}

// ---------- words ----------

/** "an hour", "2 hours", "45 minutes"; 0 is no limit. */
export function awayText(minutes: number): string {
  if (minutes <= 0) return 'for as long as you\'re away'
  if (minutes === NIGHT_MINUTES) return 'through the night (up to 8 hours)'
  if (minutes === 60) return 'for up to an hour'
  if (minutes % 60 === 0) return `for up to ${minutes / 60} hours`
  return `for up to ${minutes} minutes`
}

export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

export function dollars(n: number): string {
  const abs = Math.abs(n)
  const s = abs >= 1 || abs === 0 ? abs.toFixed(2) : abs.toFixed(abs >= 0.01 ? 2 : 3)
  return `${n < 0 ? '−' : ''}$${s}`
}

function share(t: Totals): string {
  return t.inputTokens > 0 ? `${Math.round((t.cacheReadTokens / t.inputTokens) * 100)}%` : '0%'
}

/**
 * Dollars for API users. Subscribers don't pay per token, so they see tokens,
 * and dollars only as "at API prices".
 */
export function money(n: number, mode: BillingMode): string {
  return mode === 'subscription' ? `≈ ${dollars(n)} at API prices` : `≈ ${dollars(n)}`
}

/** One line: what the hover card and the band's detail show. */
export function summaryLine(session: Totals, allTime: Totals, mode: BillingMode, hasPrices: boolean): string {
  const first = session.turns === 0 ? 'No turns yet this session' : `Cache served ${tokens(session.cacheReadTokens)} tokens this session (${share(session)})`
  const parts = [first, `all-time ${tokens(allTime.cacheReadTokens)}`]
  if (hasPrices && session.turns > 0) parts.push(`saved ${money(session.savedUsd, mode)}`)
  return `${parts.join(' · ')} · estimate`
}

export function statsText(a: {
  session: Totals
  allTime: Totals
  mode: BillingMode
  hasPrices: boolean
  lastWasCached: boolean | null
  windowMinutes: number
  windowSource: TtlSource
  auto: boolean
}): string {
  const block = (name: string, t: Totals) => {
    const lines = [`${name}: ${tokens(t.cacheReadTokens)} of ${tokens(t.inputTokens)} input tokens came from cache (${share(t)}), ${t.turns} turns, ${t.rebuilds} rebuilt`]
    if (a.hasPrices) lines.push(`  saved ${money(t.savedUsd, a.mode)}`)
    if (t.boops > 0) {
      const net = t.preventedUsd - t.boopCostUsd
      lines.push(
        a.hasPrices
          ? `  boops: ${t.boops}, cost ${money(t.boopCostUsd, a.mode)}, prevented ${money(t.preventedUsd, a.mode)}, net ${money(net, a.mode)}`
          : `  boops: ${t.boops}`,
      )
    }
    if (t.boopFails > 0) {
      lines.push(`  ${t.boopFails} boop${t.boopFails === 1 ? '' : 's'} failed, ${t.lostAfterFail} window${t.lostAfterFail === 1 ? '' : 's'} lost after one`)
    }
    return lines.join('\n')
  }
  const source = { 'claude-code': 'how Claude Code sets it for your plan', learned: 'corrected from what your replies showed', assumed: 'assumed until the first reply', setting: 'your setting' }[a.windowSource]
  const last = a.lastWasCached === null ? 'no turn yet' : a.lastWasCached ? 'served from cache' : 'rebuilt the cache'
  return [
    block('This session', a.session),
    block('All-time', a.allTime),
    `Last turn: ${last}. Cache window: ${a.windowMinutes} min (${source}). Auto-boop: ${a.auto ? 'on' : 'off'}.`,
    'All figures are estimates from the token counts Claude Code reports.',
  ].join('\n')
}

// ---------- settings ----------

export function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw !== null ? (raw as Partial<Settings>) : {}) }
  const animals: Animal[] = ['bear', 'cat', 'dog', 'pup']
  return {
    animal: animals.includes(s.animal) ? s.animal : 'bear',
    style: s.style === 'emoji' ? 'emoji' : 'text',
    ttl: s.ttl === 5 || s.ttl === 60 ? s.ttl : 'auto',
    auto: s.auto !== false,
    maxAwayMinutes: Number.isFinite(s.maxAwayMinutes) && s.maxAwayMinutes >= 0 ? Math.floor(s.maxAwayMinutes) : DEFAULT_SETTINGS.maxAwayMinutes,
    maxContextTokens:
      Number.isFinite(s.maxContextTokens) && s.maxContextTokens > 0 ? Math.floor(s.maxContextTokens) : DEFAULT_SETTINGS.maxContextTokens,
    sound: s.sound === true,
    earlyPercent: isEarlyPercent(s.earlyPercent) ? Math.round(s.earlyPercent) : null,
    remote: s.remote === true,
    stopWhenBig: s.stopWhenBig === true,
    prices: typeof s.prices === 'object' && s.prices !== null ? s.prices : {},
  }
}

export function isEarlyPercent(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 10 && n <= 95
}

export function freshRuntime(): Runtime {
  return {
    lastFedAt: null,
    lastRealTurnAt: null,
    fedUntil: 0,
    contextTokens: 0,
    model: null,
    lastWasCached: null,
    boopsInRow: 0,
    boopsSinceReal: 0,
    boopCostSinceReal: 0,
    hungrySpellNotified: false,
    capNotified: false,
    sizeNotified: false,
    ...boopsLanded,
    session: emptyTotals(),
  }
}

/** The settings as one plain block, for sessions that draw no pane (cloud). */
export function settingsText(s: Settings, windowMinutes: number, windowSource: TtlSource): string {
  const away = s.maxAwayMinutes === 0 ? 'always' : s.maxAwayMinutes === NIGHT_MINUTES ? 'night (8 h)' : `${s.maxAwayMinutes} min`
  const window = s.ttl === 'auto' ? `auto (now ${windowMinutes} min)` : `${windowMinutes} min (your setting)`
  const early = s.earlyPercent !== null ? `${s.earlyPercent}%` : s.remote ? `${REMOTE_EARLY_PERCENT}% (remote)` : 'off'
  return [
    `Animal: ${s.animal} · Faces: ${s.style} · Sound: ${s.sound ? 'on' : 'off'}`,
    `Auto-boop: ${s.auto ? 'on' : 'off'} · Keep warm: ${away} · Window: ${window}`,
    `Boop early: ${early} · Remote: ${s.remote ? 'on' : 'off'}`,
    'Change with /boop bear|cat|dog, /boop auto on|off, /boop away off|60|120, /boop night, /boop window auto|5|60, /boop early <percent>|off, /boop remote on|off.',
  ].join('\n')
}

export const ABOUT = [
  'Cache Companions, by George Samuelson. Feed your cache. Save your tokens.',
  'I made it because I kept losing my prompt cache between meetings and calls, and with how much I use Claude, that adds up.',
  "I love animals, and over the past eight years I've rescued more than 20 cats, all self-funded, so the companion had to be an animal.",
  'It is free. If it saves you money and you want to help the animals: buymeacoffee.com/georgesamuelson · Venmo @georgesamuelson',
  'Say hi: @georgesamuelson on Instagram and X · github.com/georgesamuelson/cache-companions',
].join('\n')

export const HELP = [
  '/boop                  feed the cache now (runs quietly, nothing in the chat)',
  '/boop settings         pick animal, faces, auto-boop, sound, window',
  '/boop bear|cat|dog     swap animal (/boop pup if the dog looks broken)',
  '/boop text|emoji       face style',
  '/boop auto on|off      keep the cache warm while you\'re away',
  '/boop away off|60|120  how long auto-boop keeps it warm after your last turn (off = no limit, the default)',
  '/boop night            auto-boop on, warm through the night (8 hours), then it lets go',
  '/boop sound on|off     one soft sound when it gets hungry',
  '/boop window auto|5|60 cache window in minutes (auto detects it)',
  '/boop big keep|stop    keep auto-booping big conversations (default) or stop',
  '/boop early <percent>  first auto-boop at that share of the window (10–95), so retries have room',
  '/boop early off        first auto-boop about 30 s before expiry (the default)',
  '/boop remote [on|off]  travel mode: boop early (70%), retry, stagger panes on a shaky connection',
  '/boop stats            what the cache saved (estimate)',
  '/boop price <model> <input> <write5m> <write1h> <read> <output>   override a price ($/M tokens)',
  '/boop price reset      back to the built-in prices',
  '/boop about            why this exists, and the animals it helps',
].join('\n')
