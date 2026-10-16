import type { Price } from '../types'

/**
 * Anthropic API list prices, dollars per million tokens.
 *
 * Checked against https://platform.claude.com/docs/en/about-claude/pricing
 * on 2026-10-16. Edit with `/boop price` rather than here; this is only the
 * starting point. Keys are `<family>-<major>[-<minor>]`, as `modelKey` makes.
 */
export const PRICES_CHECKED = '2026-10-16'

const p = (input: number, write5m: number, write1h: number, read: number, output: number): Price => ({
  input,
  write5m,
  write1h,
  read,
  output,
})

const OPUS_4_5_TO_5 = p(5, 6.25, 10, 0.5, 25)
const OPUS_4_OLD = p(15, 18.75, 30, 1.5, 75)
const SONNET_4 = p(3, 3.75, 6, 0.3, 15)

export const DEFAULT_PRICES: Record<string, Price> = {
  'fable-5-1': p(10, 12.5, 20, 0.25, 50),
  'mythos-5-1': p(10, 12.5, 20, 0.25, 50),
  'fable-5': p(10, 12.5, 20, 1, 50),
  'mythos-5': p(10, 12.5, 20, 1, 50),
  'opus-5-5': p(4, 5, 8, 0.2, 20),
  'opus-5': OPUS_4_5_TO_5,
  'opus-4-8': OPUS_4_5_TO_5,
  'opus-4-7': OPUS_4_5_TO_5,
  'opus-4-6': OPUS_4_5_TO_5,
  'opus-4-5': OPUS_4_5_TO_5,
  'opus-4-1': OPUS_4_OLD,
  'opus-4': OPUS_4_OLD,
  'sonnet-5-5': p(2, 2.5, 4, 0.1, 10),
  'sonnet-5': p(2, 2.5, 4, 0.2, 10),
  'sonnet-4-6': SONNET_4,
  'sonnet-4-5': SONNET_4,
  'sonnet-4': SONNET_4,
  'haiku-5-5': p(0.1, 0.125, 0.2, 0.01, 0.5),
  'haiku-4-5': p(1, 1.25, 2, 0.1, 5),
  'haiku-3-5': p(0.8, 1, 1.6, 0.08, 4),
}

/** Haiku 5.5 is priced higher on prompts over 100,000 tokens. */
export const LONG_PROMPT_PRICES: Record<string, { over: number; price: Price }> = {
  'haiku-5-5': { over: 100_000, price: p(0.5, 0.625, 1, 0.05, 2.5) },
}
