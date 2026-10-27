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
  settingsText,
  DEFAULT_SETTINGS,
  showsShortWindow,
  statsText,
  statusText,
  summaryLine,
  turnSavedUsd,
  resumedFedAt,
  addTurn,
  bigNotice,
  emptyTotals,
  boopOutcome,
  retryAt,
  boopStartMs,
  isBoopHung,
  noteFor,
  normalizeSettings,
  addFailedBoop,
  addLostWindow,
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

  test('a rebuild after 5+ minutes on the same model shows the hour window was wrong', () => {
    expect(showsShortWindow(60, 8 * MIN, true, usage(0, 90_000))).toBe(true)
    expect(showsShortWindow(60, 8 * MIN, true, usage(90_000, 0))).toBe(false)
    expect(showsShortWindow(60, 3 * MIN, true, usage(0, 90_000))).toBe(false)
    expect(showsShortWindow(60, 8 * MIN, false, usage(0, 90_000))).toBe(false)
    expect(showsShortWindow(5, 8 * MIN, true, usage(0, 90_000))).toBe(false)
  })

  test('settings as text for sessions with no pane', () => {
    expect(settingsText(DEFAULT_SETTINGS, 5, 'claude-code')).toContain('Auto-boop: on · Keep warm: always · Window: auto (now 5 min)')
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
  const base = {
    settings: { auto: true, maxAwayMinutes: 60, maxContextTokens: 400_000, stopWhenBig: false, earlyPercent: null, remote: false },
    isBusy: false,
    isBooping: false,
    awayMs: 10 * MIN,
    windowMs: 5 * MIN,
    now: 0,
    retryAt: null,
    jitterMs: 0,
  }

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

describe('shaky connections', () => {
  const ok = (read: number, write: number) => ({ isAnswered: true as const, usage: usage(read, write) })
  const fail = (status: number | null, error: string, read = 0) => ({ isAnswered: false as const, reason: 'api-error', status, error, usage: usage(read, 0, 0, 0) })

  test('a boop counts as done only when its usage shows a cache read', () => {
    expect(boopOutcome(ok(80_000, 0))).toEqual({ kind: 'fed' })
    expect(boopOutcome(ok(0, 90_000))).toEqual({ kind: 'rebuilt' })
    // A dropped connection still reports usage, all zeros: not a boop.
    expect(boopOutcome(fail(null, 'unknown'))).toEqual({ kind: 'failed', why: 'offline' })
    expect(boopOutcome(fail(529, 'overloaded'))).toEqual({ kind: 'failed', why: 'busy' })
    expect(boopOutcome(fail(429, 'rate_limit'))).toEqual({ kind: 'failed', why: 'busy' })
    expect(boopOutcome(fail(401, 'authentication_failed'))).toEqual({ kind: 'failed', why: 'stopped' })
    expect(boopOutcome(fail(400, 'invalid_request'))).toEqual({ kind: 'failed', why: 'stopped' })
    // Failed partway, but the cache was read: the cache was refreshed.
    expect(boopOutcome(fail(null, 'unknown', 80_000))).toEqual({ kind: 'fed' })
    expect(boopOutcome({ isAnswered: false, reason: 'aborted', usage: usage(0, 0, 0, 0) })).toEqual({ kind: 'failed', why: 'busy' })
    expect(boopOutcome({ isAnswered: false, reason: 'empty-reply', usage: usage(80_000, 0) })).toEqual({ kind: 'fed' })
    // Failed after an earlier step of the fork wrote the whole prefix: it rebuilt, and that cost counts.
    expect(boopOutcome({ ...fail(null, 'unknown'), usage: usage(0, 90_000) })).toEqual({ kind: 'rebuilt' })
  })

  test('retries back off 30 s, 60 s, 2 min, but never past the window', () => {
    // An hour window, first boop early with 12 minutes left: the full ladder.
    expect(retryAt(0, 1, 12 * MIN)).toBe(30_000)
    expect(retryAt(0, 2, 11 * MIN)).toBe(60_000)
    expect(retryAt(0, 3, 10 * MIN)).toBe(120_000)
    expect(retryAt(0, 9, 8 * MIN)).toBe(120_000)
    // Today's 30-second boop: half the time left each time, at least 5 s.
    expect(retryAt(0, 1, 30_000)).toBe(15_000)
    expect(retryAt(0, 2, 15_000)).toBe(7_500)
    expect(retryAt(0, 3, 12_000)).toBe(6_000)
    // No room left before the last 3 seconds: give up.
    expect(retryAt(0, 3, 7_500)).toBe(null)
  })

  test('boop early starts at a share of the window; off is the last 30 seconds', () => {
    expect(boopStartMs(60 * MIN, null, false, 0)).toBe(30_000)
    expect(boopStartMs(60 * MIN, 80, false, 0)).toBe(12 * MIN)
    expect(boopStartMs(5 * MIN, 80, false, 0)).toBe(1 * MIN)
    // Remote mode: 70% unless you set your own share.
    expect(boopStartMs(60 * MIN, null, true, 0)).toBe(18 * MIN)
    expect(boopStartMs(60 * MIN, 80, true, 0)).toBe(12 * MIN)
    // Never later than today's 30 seconds; the stagger moves it earlier.
    expect(boopStartMs(5 * MIN, 95, false, 0)).toBe(30_000)
    expect(boopStartMs(5 * MIN, 80, true, 4_000)).toBe(64_000)
  })

  test('auto-boop with early on, and waiting for the next retry', () => {
    const rt = { contextTokens: 1 }
    const base = {
      settings: { auto: true, maxAwayMinutes: 0, maxContextTokens: 400_000, stopWhenBig: false, earlyPercent: null, remote: false },
      isBusy: false,
      isBooping: false,
      awayMs: 10 * MIN,
      now: 0,
      retryAt: null,
      jitterMs: 0,
    }
    const early = { ...base, settings: { ...base.settings, earlyPercent: 80 }, windowMs: 60 * MIN }
    expect(autoBoop({ ...early, rt, leftMs: 13 * MIN })).toBe('wait')
    expect(autoBoop({ ...early, rt, leftMs: 12 * MIN })).toBe('boop')
    expect(autoBoop({ ...early, rt, leftMs: 11 * MIN, now: 10_000, retryAt: 30_000 })).toBe('wait')
    expect(autoBoop({ ...early, rt, leftMs: 11 * MIN, now: 30_000, retryAt: 30_000 })).toBe('boop')
  })

  test('a boop with no answer after 20 s stops blocking retries', () => {
    expect(isBoopHung(null, 100_000)).toBe(false)
    expect(isBoopHung(0, 19_000)).toBe(false)
    expect(isBoopHung(0, 20_000)).toBe(true)
  })

  test('the band says when boops are failing, and when remote mode is on', () => {
    const n = (o: Partial<Parameters<typeof noteFor>[0]>) => noteFor({ failedBoops: 0, lastFailure: null, mood: 'fresh', remote: false, ...o })
    expect(n({})).toBe(null)
    expect(n({ remote: true })).toBe('remote')
    expect(n({ failedBoops: 1, lastFailure: 'busy' })).toBe('retrying')
    expect(n({ failedBoops: 2, lastFailure: 'offline', remote: true })).toBe('offline')
    expect(n({ failedBoops: 2, lastFailure: 'offline', mood: 'cold' })).toBe('likely-cold')
    const c = countdown({ lastFedAt: 0, fedUntil: 0 }, 5 * MIN, 78_000, false)
    expect(statusText('ʕ•ᴥ•ʔ', c, true, 'offline')).toBe('ʕ•ᴥ•ʔ 3:42↻ offline')
    const cold = countdown({ lastFedAt: 0, fedUntil: 0 }, 5 * MIN, 400_000, false)
    expect(statusText('ʕ-ᴥ-ʔᶻᶻ', cold, true, 'likely-cold')).toBe('ʕ-ᴥ-ʔᶻᶻ likely cold')
  })

  test('early is off by default and takes 10 to 95 percent', () => {
    expect(DEFAULT_SETTINGS.earlyPercent).toBe(null)
    expect(DEFAULT_SETTINGS.remote).toBe(false)
    expect(normalizeSettings({ earlyPercent: 80 }).earlyPercent).toBe(80)
    expect(normalizeSettings({ earlyPercent: 5 }).earlyPercent).toBe(null)
    expect(normalizeSettings({ earlyPercent: 'x' }).earlyPercent).toBe(null)
    expect(normalizeSettings({ remote: true }).remote).toBe(true)
  })

  test('stats count failed boops and windows lost after one', () => {
    // A window counts as lost only when the next real turn really rebuilt.
    let t = addFailedBoop(emptyTotals(), 0)
    t = addLostWindow(addFailedBoop(t, 0))
    expect(t.boops).toBe(0)
    expect(t.boopFails).toBe(2)
    expect(t.lostAfterFail).toBe(1)
    const s = statsText({ session: t, allTime: t, mode: 'api', hasPrices: true, lastWasCached: null, windowMinutes: 5, windowSource: 'assumed', auto: true })
    expect(s).toMatch(/2 boops failed, 1 window lost after one/)
  })
})
