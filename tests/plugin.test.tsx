import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'cache-companions'
const usage = (read: number, write: number) => ({
  input_tokens: 50,
  output_tokens: 20,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

/** The engine beneath the plugin: what it asks of the session, and what it shows. */
type ForkReply = { isAnswered: true; text: string; usage: ReturnType<typeof usage> } | { isAnswered: false; reason: 'api-error'; status: number | null; error: 'unknown' | 'overloaded' | 'authentication_failed'; usage: ReturnType<typeof usage> }
/** The connection is down: the fork reports zeros, as a dropped request does. */
const DROPPED: ForkReply = { isAnswered: false, reason: 'api-error', status: null, error: 'unknown', usage: { ...usage(0, 0), input_tokens: 0, output_tokens: 0 } }

function world(
  on: On,
  opts: { kind?: string; settings?: object; env?: Record<string, string>; percentUsed?: number; forkRebuilds?: boolean; fork?: (n: number) => ForkReply | undefined; contextTokens?: number } = {},
) {
  const model = { current: 'claude-opus-5-5' }
  const clock = mock.clock(on, { now: 1_000_000 })
  // The machine's plugin store, which every session on it shares.
  const store = new Map<string, unknown>([['welcomed', true], ...(opts.settings ? [['settings', opts.settings] as const] : [])])
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  const shown = { status: [] as (string | undefined)[], toasts: [] as string[], forks: 0 }
  // Subscriptions report usage-limit windows; an API key reports none.
  // Past its plan (usage credits) by default, so the window is 5 minutes.
  const rateLimits = (opts.kind ?? 'claude.ai') === 'claude.ai' ? [{ kind: 'five_hour', percentUsed: opts.percentUsed ?? 100 }] : []
  on('settings.read', () => ({ value: {} }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: opts.contextTokens, window: 1_000_000 }, rateLimits } as never }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.status', (_$, e) => {
    shown.status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    shown.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('model.fork', () => {
    shown.forks += 1
    const scripted = opts.fork?.(shown.forks)
    if (scripted) return { value: scripted }
    return { value: { isAnswered: true as const, text: 'boop', usage: opts.forkRebuilds ? usage(0, 90_000) : usage(80_000, 0) } }
  })
  on('session.start', () => ({ cwd: '/' }))
  on('env.get', (_$, e) => ({ value: opts.env?.[e.name] }))
  on('session.model', () => ({ value: model.current }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId ?? 't' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  // Stands in for Claude Code drawing the hint line under the prompt, ` · ` before the tail.
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.tail ? `${e.props.hint} · ${e.props.tail}` : e.props.hint}</Text>
  })
  return { clock, shown, store, model }
}

const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }
const HINT = { isDraft: false, isWorking: false, hint: 'auto mode on' }
/** What the CLI hint line shows after Claude Code's own text. */
async function status($: Engine) {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'PromptHint', props: HINT })
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()
  return text?.replace('auto mode on · ', '')
}

async function aTurn($: Engine, read: number, write: number) {
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { ...usage(read, write), model: 'claude-opus-5-5' },
  })
}

test('the CLI entry counts down from each turn and goes cold', async ($, on) => {
  const { clock } = world(on, { settings: { auto: false } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await status($)).toBe('ʕ•ᴥ•ʔ')

  await aTurn($, 90_000, 1_000)
  expect(await status($)).toBe('ʕ^ᴥ^ʔ 5:00')
  await clock.advance(62_000)
  expect(await status($)).toBe('ʕ•ᴥ•ʔ 3:58')
  await clock.advance(240_000)
  expect(await status($)).toBe('ʕ-ᴥ-ʔᶻᶻ')
})

test('auto-boop keeps the cache warm, stops after the away limit, and a real prompt restarts it', async ($, on) => {
  const { clock, shown } = world(on, { settings: { auto: true, maxAwayMinutes: 10 } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 1_000)
  expect(await status($)).toMatch(/↻$/)

  // Each boop lands about 30 s before expiry and restarts the window.
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(1)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(2)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(2)
  expect(shown.toasts.some(t => /been away a while/.test(t))).toBe(true)

  // The cache went cold meanwhile, so this turn rebuilds it.
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
  await aTurn($, 0, 90_000)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(3)
})

test('a big conversation gets one /compact tip and keeps auto-booping', async ($, on) => {
  const { clock, shown } = world(on, { settings: { auto: true, maxContextTokens: 100_000 } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 200_000, 0)
  await aTurn($, 200_000, 0)
  expect(shown.toasts.filter(t => /\/compact/.test(t)).length).toBe(1)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(1)
})

test('with /boop big stop, auto-boop stops on a big conversation', async ($, on) => {
  const { clock, shown } = world(on, { settings: { auto: true, maxContextTokens: 100_000, stopWhenBig: true } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 200_000, 0)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(0)
  expect(shown.toasts.some(t => /Auto-boop paused/.test(t))).toBe(true)
})

test('stats: subscribers see dollars only as API prices; API users see dollars', async ($, on) => {
  world(on, { kind: 'claude.ai' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 1_000_000, 0)
  const sub = await $.command.run({ command: 'boop', args: 'stats', ...RUN })
  expect(sub.text).toMatch(/at API prices/)
})

test('stats for an API key show plain dollars', async ($, on) => {
  world(on, { kind: 'api-key' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 1_000_000, 0)
  const api = await $.command.run({ command: 'boop', args: 'stats', ...RUN })
  expect(api.text).toMatch(/saved ≈ \$3\.80/)
  expect(api.text).not.toMatch(/API prices/)
})

test('a resumed session picks up the countdown where it really is', async ($, on) => {
  world(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 130, prompt_cache_likely_expired: false })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await status($)).toMatch(/ 2:50↻$/)
})

test('a session resumed after the cache lapsed shows cold at once', async ($, on) => {
  world(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 400, prompt_cache_likely_expired: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await status($)).toBe('ʕ-ᴥ-ʔᶻᶻ')
})

test('an auto-boop that finds the cache gone pauses until the next message', async ($, on) => {
  const { clock, shown } = world(on, { forkRebuilds: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(5 * 60_000)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(1)
  expect(shown.toasts.some(t => /already gone/.test(t))).toBe(true)
  await aTurn($, 90_000, 0)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(2)
})

test('a model switch shows cold and stops boops until the next message', async ($, on) => {
  const { clock, shown, model } = world(on, { settings: { auto: true } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  model.current = 'claude-sonnet-5-5'
  await clock.advance(11_000)
  expect(await status($)).toBe('ʕ-ᴥ-ʔᶻᶻ')
  expect(shown.toasts.some(t => /sonnet-5-5/.test(t))).toBe(true)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(0)
})

test('a subscription within its plan gets the hour window', async ($, on) => {
  world(on, { percentUsed: 40, settings: { auto: false } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  expect(await status($)).toBe('ʕ^ᴥ^ʔ 60:00')
})

test('a rebuild where the hour window said warm switches the timer to 5 minutes', async ($, on) => {
  const { clock, shown } = world(on, { percentUsed: 40, settings: { auto: false } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(8 * 60_000)
  await aTurn($, 0, 90_000)
  expect(shown.toasts.some(t => /last 5 minutes/.test(t))).toBe(true)
  expect(await status($)).toBe('ʕ^ᴥ^ʔ 5:00')
})

test('auto-boop is on out of the box', async ($, on) => {
  const { clock, shown } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(1)
})

test('CACHE_COMPANIONS_AUTO=0 starts with auto-boop off', async ($, on) => {
  const { clock, shown } = world(on, { env: { CACHE_COMPANIONS_AUTO: '0' } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(0)
})

test('settings and all-time totals are shared with other sessions on the machine', async ($, on) => {
  const { clock, store } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  // Another session (say the desktop app) adds 5 turns and switches to the cat.
  const other = store.get('totals') as { turns: number }
  store.set('totals', { ...other, turns: other.turns + 5 })
  store.set('settings', { animal: 'cat' })
  await aTurn($, 90_000, 0)
  expect((store.get('totals') as { turns: number }).turns).toBe(7)
  await clock.advance(62_000)
  expect(await status($)).toBe('(=^･ω･^=) 3:58↻')
})

test('the app band shows the face, a bar and Boop, and its settings card', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await aTurn($, 90_000, 0)
  const props = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  }
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props })
  expect(await ui.find({ key: 'boop', text: 'Boop' })).toBeDefined()
  await ui.press({ key: 'face' })
  expect(await ui.find({ key: 'auto-true' })).toBeDefined()
  await ui.press({ key: 'auto-true' })
  expect(await ui.find({ key: 'boop', text: '↻ Auto-Boop On' })).toBeDefined()
  await ui.unmount()
})

test('the CLI shows the companion at the end of the hint line', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'PromptHint', props: HINT })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('auto mode on · ʕ^ᴥ^ʔ 5:00↻')
  await ui.unmount()
})

test('a boop that fails on a dropped connection does not reset the timer, and retries until it lands', async ($, on) => {
  // The first two boops hit a dead connection; the third gets through.
  const { clock, shown } = world(on, { fork: n => (n <= 2 ? DROPPED : undefined) })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(4 * 60_000 + 31_000)
  expect(shown.forks).toBe(1)
  // Still counting down from the turn, and saying so.
  expect(await status($)).toBe('ʕ•o•ʔ! 0:29↻ offline')
  expect(shown.toasts.some(t => /already gone/.test(t))).toBe(false)
  await clock.advance(15_000)
  expect(shown.forks).toBe(2)
  await clock.advance(8_000)
  expect(shown.forks).toBe(3)
  // Warm again, counted from when that boop went out.
  expect(await status($)).toMatch(/ 4:5\d↻$/)
  const stats = await $.command.run({ command: 'boop', args: 'stats', ...RUN })
  expect(stats.text).toMatch(/2 boops failed/)
})

test('when the connection stays down past the window: likely cold, one toast, no more boops', async ($, on) => {
  const { clock, shown } = world(on, { fork: () => DROPPED })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(6 * 60_000)
  const tries = shown.forks
  expect(tries).toBe(3)
  expect(await status($)).toBe('ʕ-ᴥ-ʔᶻᶻ likely cold')
  expect(shown.toasts.filter(t => /likely went cold/.test(t)).length).toBe(1)
  await clock.advance(10 * 60_000)
  expect(shown.forks).toBe(tries)
  // You come back: that turn rebuilds, so the window counts as lost, and the warning clears.
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
  await aTurn($, 0, 90_000)
  const stats = await $.command.run({ command: 'boop', args: 'stats', ...RUN })
  expect(stats.text).toMatch(/3 boops failed, 1 window lost/)
  expect(await status($)).toMatch(/ 5:00↻$/)
})

test('a boop Claude refuses (sign-in) stops retrying until the next message', async ($, on) => {
  const refused: ForkReply = { ...DROPPED, status: 401, error: 'authentication_failed' }
  const { clock, shown } = world(on, { fork: () => refused })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  await clock.advance(5 * 60_000)
  expect(shown.forks).toBe(1)
  expect(shown.toasts.some(t => /refused/.test(t))).toBe(true)
})

test('/boop early 80 boops at 4:00 left on a 5-minute window; early off goes back to 30 s', async ($, on) => {
  const { clock, shown, store } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'boop', args: 'early 80', ...RUN })
  expect(r.text).toMatch(/80%/)
  expect((store.get('settings') as { earlyPercent: number }).earlyPercent).toBe(80)
  await aTurn($, 90_000, 0)
  await clock.advance(3 * 60_000 + 59_000)
  expect(shown.forks).toBe(0)
  await clock.advance(2_000)
  expect(shown.forks).toBe(1)
  await $.command.run({ command: 'boop', args: 'early off', ...RUN })
  await aTurn($, 90_000, 0)
  await clock.advance(4 * 60_000)
  expect(shown.forks).toBe(1)
  await clock.advance(31_000)
  expect(shown.forks).toBe(2)
})

test('/boop remote shows remote, boops at about 70%, and /boop remote off ends it', async ($, on) => {
  const { clock, shown } = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'boop', args: 'remote', ...RUN })
  await aTurn($, 90_000, 0)
  await clock.advance(3_000)
  expect(await status($)).toMatch(/↻ remote$/)
  // 70% of 5 minutes is 3:30 in, less a stagger of up to 10 s.
  await clock.advance(3 * 60_000 + 27_000 - 3_000 - 11_000)
  expect(shown.forks).toBe(0)
  await clock.advance(15_000)
  expect(shown.forks).toBe(1)
  await $.command.run({ command: 'boop', args: 'remote off', ...RUN })
  expect(await status($)).not.toMatch(/remote/)
})

test('the size notice uses the conversation size, not a turn that added up many requests', async ($, on) => {
  // A turn with tool calls: its requests summed come to 830k, but the conversation is 98k.
  const { shown } = world(on, { contextTokens: 98_000 })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 800_000, 30_000)
  expect(shown.toasts.some(t => /\/compact/.test(t))).toBe(false)
})

test('in the desktop app\'s Terminal panel the CLI entry uses the text face, which it draws at the right width', async ($, on) => {
  world(on, { settings: { animal: 'cat', style: 'emoji', auto: false }, env: { TERM_PROGRAM: 'claude-desktop' } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  expect(await status($)).toBe('(=^‿^=) 5:00')
})

test('other terminals keep the emoji face', async ($, on) => {
  world(on, { settings: { animal: 'cat', style: 'emoji', auto: false } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await aTurn($, 90_000, 0)
  expect(await status($)).toBe('😻 5:00')
})
