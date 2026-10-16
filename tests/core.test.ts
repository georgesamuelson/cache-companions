import { describe, expect, test } from 'claude-code/testing'

import type { Usage } from '../types'
import {
  autoBoop,
  boopCostUsd,
  countdown,
  faceFor,
  freshRuntime,
  modelKey,
  moodOf,
  onRealPrompt,
  preventedUsd,
  priceFor,
  resolveWindow,
  claudeCodeWindow,
  isOnCredits,
  statsText,
  statusText,
  summaryLine,
  turnSavedUsd,
  resumedFedAt,
  addTurn,
  bigNotice,
  emptyTotals,
} from '../hooks/core'

const MIN = 60_000
const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const usage = (read: number, write: number, input = 100, output = 50): Usage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

describe('countdown and moods', () => {
  test('mood thresholds: fresh above 60%, peckish 30–60%, hungry below 30%', () => {
    expect(moodOf(0.61)).toBe('fresh')
    expect(moodOf(0.6)).toBe('peckish')
    expect(moodOf(0.3)).toBe('peckish')
    expect(moodOf(0.29)).toBe('hungry')
  })

  test('a 5-minute window walks fresh → peckish → hungry → cold', () => {
    const rt = { lastFedAt: 0, fedUntil: 2000 }
    const at = (ms: number) => countdown(rt, 5 * MIN, ms, false)
    expect(at(1000).mood).toBe('fed')
    expect(at(60_000).mood).toBe('fresh')
    expect(at(150_000).mood).toBe('peckish')
    expect(at(240_000).mood).toBe('hungry')
    expect(at(300_000).mood).toBe('cold')
    expect(at(1_000_000).leftMs).toBe(0)
  })

  test('no countdown before the first turn or while Claude works', () => {
    expect(countdown({ lastFedAt: null, fedUntil: 0 }, 5 * MIN, 10, false).mood).toBe('idle')
    expect(countdown({ lastFedAt: 0, fedUntil: 0 }, 5 * MIN, 10, true).leftMs).toBe(null)
  })

  test('status line: face, time, and ↻ after the time when auto-boop is on', () => {
    const c = countdown({ lastFedAt: 0, fedUntil: 0 }, 5 * MIN, 78_000, false)
    expect(statusText('ʕ•ᴥ•ʔ', c, false)).toBe('ʕ•ᴥ•ʔ 3:42')
    expect(statusText('ʕ•ᴥ•ʔ', c, true)).toBe('ʕ•ᴥ•ʔ 3:42↻')
    const cold = countdown({ lastFedAt: 0, fedUntil: 0 }, 5 * MIN, 400_000, false)
    expect(statusText('ʕ-ᴥ-ʔᶻᶻ', cold, true)).toBe('ʕ-ᴥ-ʔᶻᶻ')
  })

  test('faces: peckish has its own eyes and blinks one second in five', () => {
    expect(faceFor('bear', 'text', 'peckish', 1000)).toBe('ʕ°ᴥ°ʔ')
    expect(faceFor('bear', 'text', 'peckish', 5000)).toBe('ʕ-ᴥ-ʔ')
    expect(faceFor('cat', 'text', 'hungry', 0)).toBe('(=^･o･^=)!')
    expect(faceFor('dog', 'emoji', 'fed', 0)).toBe('🐶🦴')
    expect(faceFor('pup', 'text', 'cold', 0)).toBe('∪-ω-∪ᶻᶻ')
  })
})

describe('the cache window', () => {
  test("your setting wins; then Claude Code's rule; before any reading, 5 minutes", () => {
    expect(resolveWindow(60, 5)).toEqual({ minutes: 60, source: 'setting' })
    expect(resolveWindow('auto', 60)).toEqual({ minutes: 60, source: 'claude-code' })
    expect(resolveWindow('auto', null)).toEqual({ minutes: 5, source: 'assumed' })
  })

  test("Claude Code's rule: an hour on a subscription within its plan, 5 minutes on credits or an API key", () => {
    const base = { force5m: undefined, envTtl: undefined, settingTtl: undefined, enable1h: undefined }
    expect(claudeCodeWindow({ ...base, mode: 'subscription', onCredits: false })).toBe(60)
    expect(claudeCodeWindow({ ...base, mode: 'subscription', onCredits: true })).toBe(5)
    expect(claudeCodeWindow({ ...base, mode: 'api', onCredits: false })).toBe(5)
    expect(claudeCodeWindow({ ...base, mode: 'api', onCredits: false, settingTtl: '1h' })).toBe(60)
    expect(claudeCodeWindow({ ...base, mode: 'api', onCredits: false, enable1h: '1' })).toBe(60)
    expect(claudeCodeWindow({ ...base, mode: 'subscription', onCredits: false, envTtl: '5m', settingTtl: '1h' })).toBe(5)
    expect(claudeCodeWindow({ ...base, mode: 'subscription', onCredits: false, force5m: '1', envTtl: '1h' })).toBe(5)
  })

  test('past 100% of a plan window means usage credits', () => {
    expect(isOnCredits([{ percentUsed: 99.5 }])).toBe(false)
    expect(isOnCredits([{ percentUsed: 40 }, { percentUsed: 100 }])).toBe(true)
    expect(isOnCredits([])).toBe(false)
  })
})

test('a resume starts the countdown from the last reply, or cold if it lapsed', () => {
  expect(resumedFedAt(1_000_000, 130, false)).toBe(870_000)
  expect(resumedFedAt(5_000_000, 130, true)).toBe(5_000_000 - 3_601_000)
  expect(resumedFedAt(1_000_000, undefined, false)).toBe(null)
})

describe('auto-boop', () => {
  const base = { settings: { auto: true, maxAwayMinutes: 60, maxContextTokens: 400_000, stopWhenBig: false }, isBusy: false, isBooping: false, awayMs: 10 * MIN }

  test('boops only in the last 30 seconds, and only when idle', () => {
    const rt = { boopsInRow: 0, contextTokens: 50_000 }
    expect(autoBoop({ ...base, rt, leftMs: 60_000 })).toBe('wait')
    expect(autoBoop({ ...base, rt, leftMs: 25_000 })).toBe('boop')
    expect(autoBoop({ ...base, rt, leftMs: 25_000, isBusy: true })).toBe('wait')
    expect(autoBoop({ ...base, rt, leftMs: 25_000, settings: { ...base.settings, auto: false } })).toBe('wait')
  })

  test('auto-boop stops once you have been away longer than maxAwayMinutes; 0 means no limit', () => {
    const rt = { contextTokens: 1 }
    expect(autoBoop({ ...base, rt, awayMs: 59 * MIN, leftMs: 20_000 })).toBe('boop')
    expect(autoBoop({ ...base, rt, awayMs: 61 * MIN, leftMs: 20_000 })).toBe('cap')
    expect(autoBoop({ ...base, rt, awayMs: 600 * MIN, leftMs: 20_000, settings: { ...base.settings, maxAwayMinutes: 0 } })).toBe('boop')
  })

  test('a real prompt resets the count', () => {
    const capped = { ...freshRuntime(), capNotified: true }
    const after = onRealPrompt(capped)
    expect(after.capNotified).toBe(false)
    // The turn that prompt starts sets a new last-turn time, so time away starts over.
    expect(autoBoop({ ...base, rt: after, awayMs: 0, leftMs: 20_000 })).toBe('boop')
  })

  test('big conversations keep auto-booping unless the person chose to stop', () => {
    const big = { contextTokens: 400_001 }
    expect(autoBoop({ ...base, rt: big, leftMs: 20_000 })).toBe('boop')
    expect(autoBoop({ ...base, settings: { ...base.settings, stopWhenBig: true }, rt: big, leftMs: 20_000 })).toBe('too-big')
  })

  test('the big-conversation notice suggests /compact with the per-turn cost', () => {
    const price = priceFor('claude-opus-5-5', 0, {})
    expect(bigNotice(865_000, price, 'subscription')).toBe(
      'This conversation is 865k tokens. Every turn re-reads all of it, about $0.17 a turn at API prices. /compact would make each turn cheaper. Auto-boop keeps going.',
    )
  })
})

describe('savings estimate', () => {
  test('model ids map to the price table', () => {
    expect(modelKey('claude-opus-5-5')).toBe('opus-5-5')
    expect(modelKey('claude-opus-4-5-20251101')).toBe('opus-4-5')
    expect(modelKey('claude-opus-5-20260101[1m]')).toBe('opus-5')
    expect(modelKey('us.anthropic.claude-sonnet-5-5-v1:0')).toBe('sonnet-5-5')
    expect(modelKey('claude-3-5-haiku-20241022')).toBe('haiku-3-5')
    expect(priceFor('some-other-model', 1, {})).toBe(null)
  })

  test('per turn: cache reads × (input − cache read)', () => {
    // Opus 5.5: $4 input, $0.20 cache read per million.
    const price = priceFor('claude-opus-5-5', 1_000_100, {})
    expect(r6(turnSavedUsd(usage(1_000_000, 0), price))).toBe(3.8)
  })

  test('Haiku 5.5 switches price above 100k prompt tokens', () => {
    expect(priceFor('claude-haiku-5-5', 50_000, {})?.input).toBe(0.1)
    expect(priceFor('claude-haiku-5-5', 150_000, {})?.input).toBe(0.5)
  })

  test('a boop costs its own usage; it prevents a rebuild only past the window', () => {
    const price = priceFor('claude-opus-5-5', 0, {})
    // 200k read at $0.20 + 10 input at $4 + 5 output at $20, per million.
    expect(r6(boopCostUsd(usage(200_000, 0, 10, 5), price, 5))).toBe(0.04014)
    // The next turn read 200k from cache 8 minutes after the last real turn:
    // without boops it would have written them at $5 (5-minute write) instead of reading at $0.20.
    expect(preventedUsd(usage(200_000, 0), price, 5, 8 * MIN, 1)).toBe(0.96)
    expect(preventedUsd(usage(200_000, 0), price, 5, 3 * MIN, 1)).toBe(0)
    expect(preventedUsd(usage(200_000, 0), price, 5, 8 * MIN, 0)).toBe(0)
  })

  test('subscription mode never shows a bare dollar figure', () => {
    const price = priceFor('claude-opus-5-5', 0, {})
    const t = addTurn(emptyTotals(), usage(1_000_000, 0), turnSavedUsd(usage(1_000_000, 0), price), 0)
    const sub = statsText({ session: t, allTime: t, mode: 'subscription', hasPrices: true, lastWasCached: true, windowMinutes: 5, windowSource: 'assumed', auto: false })
    for (const m of sub.match(/\$[\d.]+[^\n,·]*/g) ?? []) expect(m).toMatch(/at API prices/)
    expect(summaryLine(t, t, 'subscription', true)).toMatch(/at API prices/)
    const api = statsText({ session: t, allTime: t, mode: 'api', hasPrices: true, lastWasCached: true, windowMinutes: 5, windowSource: 'assumed', auto: false })
    expect(api).not.toMatch(/API prices/)
    expect(api).toMatch(/\$3\.80/)
  })
})
