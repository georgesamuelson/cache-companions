// The plugin's logic as plain functions: no `$`, no clock, no I/O, so the
// tests can call every rule directly. register.tsx is the glue.
import type {
  Animal,
  BillingMode,
  FaceStyle,
  Mood,
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
  prices: {},
}

/** `/boop night`: keep the cache warm overnight, then let it go. */
export const NIGHT_MINUTES = 8 * 60

/** Auto-boop fires once this little of the window is left. */
export const AUTO_BOOP_AT_MS = 30_000
/** ...but not this close to expiry, in case the boop is slow to land. */
export const AUTO_BOOP_LATEST_MS = 3_000
export const FED_MS = 2_000
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

/** The CLI status entry: `ʕ•ᴥ•ʔ 3:42`, `↻` after the time while auto-boop is on. */
export function statusText(face: string, c: Countdown, auto: boolean): string {
  if (c.leftMs === null || c.mood === 'cold') return face
  return `${face} ${clockText(c.leftMs)}${auto ? '↻' : ''}`
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

export type AutoBoopCheck = {
  settings: Pick<Settings, 'auto' | 'maxAwayMinutes' | 'maxContextTokens' | 'stopWhenBig'>
  rt: Pick<Runtime, 'contextTokens'>
  /** How long since your last turn ended; null before the first. */
  awayMs: number | null
  leftMs: number | null
  isBusy: boolean
  isBooping: boolean
}

export type AutoBoopDecision = 'boop' | 'wait' | 'cap' | 'too-big'

export function autoBoop(c: AutoBoopCheck): AutoBoopDecision {
  if (!c.settings.auto || c.isBusy || c.isBooping || c.leftMs === null) return 'wait'
  if (c.leftMs > AUTO_BOOP_AT_MS || c.leftMs < AUTO_BOOP_LATEST_MS) return 'wait'
  if (c.settings.stopWhenBig && c.rt.contextTokens > c.settings.maxContextTokens) return 'too-big'
  if (c.settings.maxAwayMinutes > 0 && c.awayMs !== null && c.awayMs > c.settings.maxAwayMinutes * 60_000) return 'cap'
  return 'boop'
}

/** A prompt the person typed: the boop streak and its warnings start over. */
export function onRealPrompt(rt: Runtime): Runtime {
  return { ...rt, boopsInRow: 0, capNotified: false }
}

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
    return lines.join('\n')
  }
  const source = { 'claude-code': 'how Claude Code sets it for your plan', learned: 'learned', assumed: 'assumed until the first reply', setting: 'your setting' }[a.windowSource]
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
    stopWhenBig: s.stopWhenBig === true,
    prices: typeof s.prices === 'object' && s.prices !== null ? s.prices : {},
  }
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
    session: emptyTotals(),
  }
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
  '/boop stats            what the cache saved (estimate)',
  '/boop price <model> <input> <write5m> <write1h> <read> <output>   override a price ($/M tokens)',
  '/boop price reset      back to the built-in prices',
  '/boop about            why this exists, and the animals it helps',
].join('\n')
