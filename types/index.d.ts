export type Animal = 'bear' | 'cat' | 'dog' | 'pup'
export type FaceStyle = 'text' | 'emoji'
export type Mood = 'idle' | 'fresh' | 'peckish' | 'hungry' | 'fed' | 'cold'
export type TtlSetting = 'auto' | 5 | 60
export type TtlSource = 'claude-code' | 'learned' | 'assumed' | 'setting'
export type BillingMode = 'api' | 'subscription'
/** Why a boop didn't land: no connection, the API busy or erroring, or a refusal retrying won't fix. */
export type BoopFailure = 'offline' | 'busy' | 'stopped'
/** What the band and the CLI entry say beside the timer, when anything. */
export type Note = 'retrying' | 'offline' | 'likely-cold' | 'remote'

/** Dollars per million tokens. */
export type Price = {
  input: number
  write5m: number
  write1h: number
  read: number
  output: number
}

export type Settings = {
  animal: Animal
  style: FaceStyle
  ttl: TtlSetting
  auto: boolean
  /** Auto-boop keeps the cache warm this long after your last turn; 0 = no limit. */
  maxAwayMinutes: number
  /** Past this many tokens the companion suggests /compact. */
  maxContextTokens: number
  /** Stop auto-boop past maxContextTokens; off by default (it keeps booping). */
  stopWhenBig: boolean
  sound: boolean
  /** First auto-boop at this percent of the window; null = about 30 s before expiry. */
  earlyPercent: number | null
  /** Travel mode: boops early (70% unless earlyPercent is set) and staggers across panes. */
  remote: boolean
  /** Per-model overrides of the built-in price table, keyed like `opus-5-5`. */
  prices: Record<string, Price>
}

export type Totals = {
  turns: number
  inputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  rebuilds: number
  savedUsd: number
  boops: number
  boopCostUsd: number
  preventedUsd: number
  /** Boops that didn't land (no cache read came back). */
  boopFails: number
  /** Windows that closed after a failed boop: the cache likely went cold. */
  lostAfterFail: number
}

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type Runtime = {
  /** When the cache was last fed: a real turn or a boop. */
  lastFedAt: number | null
  /** When the last real (person-started) turn ended. */
  lastRealTurnAt: number | null
  fedUntil: number
  contextTokens: number
  model: string | null
  lastWasCached: boolean | null
  /** Auto-boops since the last real prompt; the cap counts these. */
  boopsInRow: number
  /** Boops of any kind since the last real turn. */
  boopsSinceReal: number
  boopCostSinceReal: number
  hungrySpellNotified: boolean
  capNotified: boolean
  sizeNotified: boolean
  /** Failed boops since the cache was last fed. */
  failedBoops: number
  lastFailure: BoopFailure | null
  /** No auto-boop before this time: the next retry, or the window's end once it gave up. */
  retryAt: number | null
  /** The "likely cold" toast was shown for this window. */
  coldNotified: boolean
  session: Totals
}

export type View = {
  face: string
  /** The CLI entry: `ʕ•ᴥ•ʔ 3:42`, `↻` after the time while auto-boop is on. */
  status: string
  mood: Mood
  /** Share of the window left, 0 to 1; null before the first turn. */
  fraction: number | null
  clock: string | null
  auto: boolean
  summary: string
  settings: Settings
  windowMinutes: number
  windowSource: TtlSource
  note: Note | null
  /** Time until the next planned auto-boop, `m:ss`; null when none is planned. */
  nextBoop: string | null
}

/** The parts of a `$.model.fork` result the rules read. */
export type BoopReply = {
  isAnswered: boolean
  reason?: string
  status?: number | null
  error?: string
  usage?: Usage
}

declare module 'claude-code' {
  interface PluginState {
    'cache-companions': {
      view: View | null
      panelOpen: boolean
      runtime: Runtime | null
    }
  }
}
