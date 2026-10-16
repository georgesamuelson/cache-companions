import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BillingMode, Runtime, Settings, Totals, Usage, View } from '../types'
import {
  BOOP_PROMPT,
  FED_MS,
  HELP,
  addBoop,
  addTurn,
  modelKey,
  sumTotals,
  bigNotice,
  awayText,
  NIGHT_MINUTES,
  tokens,
  autoBoop,
  boopCostUsd,
  clockText,
  countdown,
  emptyTotals,
  faceFor,
  freshRuntime,
  isCached,
  learnWindow,
  normalizeSettings,
  onRealPrompt,
  preventedUsd,
  priceFor,
  promptTokens,
  resolveWindow,
  statsText,
  statusText,
  summaryLine,
  turnSavedUsd,
  windowFromResume,
  resumedFedAt,
  windowFromWrites,
} from './core'
import type { WindowEvidence } from './core'

type $ = EngineInterface

const viewAtom = atom({ plugin: 'cache-companions', key: 'view' } as const, null)
const panelAtom = atom({ plugin: 'cache-companions', key: 'panelOpen' } as const, false)
const RUNTIME = { plugin: 'cache-companions', key: 'runtime' } as const
const PANE = 'cache-companions-settings'
const SOUND = 'sounds/hungry.wav'

let settings: Settings = normalizeSettings(undefined)
let rt: Runtime = freshRuntime()
let allTime: Totals = emptyTotals()
let mode: BillingMode = 'api'
const evidence: WindowEvidence = { detected: null, learned: null }
let isBusy = false
let isBooping = false
let bigStopNotified = false
let settingsReadAt = 0
let resumedAt: number | null = null
let sessionReady = false
let lastView = ''

const windowNow = () => resolveWindow(settings.ttl, evidence)

async function saveRuntime($: $) {
  await $.state.set(RUNTIME, rt)
}

/**
 * All-time totals are shared by every session on this machine (CLI and
 * desktop alike), so add this session's part to what is stored now rather
 * than writing back a copy that may be stale.
 */
async function addToAllTime($: $, delta: Totals) {
  allTime = sumTotals((await $.store.get('totals')) as Partial<Totals> | undefined, delta)
  await $.store.set('totals', allTime)
}

/** Settings are shared too: pick up a change another session made. */
async function loadSettings($: $) {
  const raw = await $.store.get('settings')
  if (raw !== undefined) {
    settings = normalizeSettings(raw)
    return
  }
  // Nothing saved yet (a new machine, or every cloud session): CACHE_COMPANIONS_AUTO=1
  // in the environment starts with auto-boop on.
  settings = normalizeSettings({ auto: (await $.env.get('CACHE_COMPANIONS_AUTO')) === '1' })
}

/**
 * A different model can't read the old model's cache, so the next turn
 * rebuilds it. Show cold now so nothing boops a cache that's already gone.
 */
async function noteModel($: $, model: string, now: number) {
  const was = rt.model === null ? null : modelKey(rt.model)
  const is = modelKey(model)
  if (was === null || is === null || was === is) return
  rt = { ...rt, model, lastFedAt: rt.lastFedAt === null ? null : now - 2 * 60 * 60_000, fedUntil: 0 }
  await saveRuntime($)
  $.ui.toast(`Switched to ${is}: its cache starts fresh with your next message.`)
}

async function applyResume($: $) {
  if (resumedAt !== null && (rt.lastFedAt === null || resumedAt > rt.lastFedAt)) {
    rt = { ...rt, lastFedAt: resumedAt, lastRealTurnAt: resumedAt, fedUntil: 0 }
    await saveRuntime($)
    await refresh($)
  }
  resumedAt = null
}

async function saveSettings($: $) {
  await $.store.set('settings', settings)
  await refresh($)
}

async function learn($: $, minutes: 5 | 60, exact: boolean) {
  if (exact) evidence.detected = minutes
  if (evidence.learned === minutes) return
  evidence.learned = minutes
  const map = ((await $.store.get('ttl')) ?? {}) as Record<string, 5 | 60>
  await $.store.set('ttl', { ...map, [mode]: minutes })
}

/** Redraws the status entry and the band's view. Called once a second. */
async function refresh($: $) {
  const now = await $.clock.now()
  // Every 10 s, pick up settings changed in another session (CLI or desktop).
  if (now - settingsReadAt >= 10_000) {
    settingsReadAt = now
    await loadSettings($)
    await noteModel($, await $.session.model(), now)
  }
  const win = windowNow()
  const c = countdown(rt, win.minutes * 60_000, now, isBusy)
  const face = faceFor(settings.animal, settings.style, c.mood, now)


  const view: View = {
    face,
    status: statusText(face, c, settings.auto),
    mood: c.mood,
    fraction: c.fraction === null ? null : Math.round(c.fraction * 100) / 100,
    clock: c.leftMs === null ? null : clockText(c.leftMs),
    auto: settings.auto,
    summary: summaryLine(rt.session, allTime, mode, priceFor(rt.model, rt.contextTokens, settings.prices) !== null),
    settings,
    windowMinutes: win.minutes,
    windowSource: win.source,
  }
  const key = JSON.stringify(view)
  if (key !== lastView) {
    lastView = key
    await update($, viewAtom, () => view)
  }

  if (c.mood === 'hungry' && !rt.hungrySpellNotified) {
    rt = { ...rt, hungrySpellNotified: true }
    if (settings.sound) $.audio.play({ asset: SOUND }, { gain: 0.5 }).catch(() => {})
  }

  const awayMs = rt.lastRealTurnAt === null ? null : now - rt.lastRealTurnAt
  const decision = autoBoop({ settings, rt, awayMs, leftMs: c.leftMs, isBusy, isBooping })
  if (decision === 'boop') {
    void boop($, 'auto')
  } else if (decision === 'cap' && !rt.capNotified) {
    rt = { ...rt, capNotified: true }
    $.ui.toast(`Auto-boop paused: you've been away a while, so I let the cache go cold. Your next prompt starts it again. (/boop away to change how long.)`, { timeoutMs: 8000 })
  } else if (decision === 'too-big' && !bigStopNotified) {
    bigStopNotified = true
    $.ui.toast(`Auto-boop paused: this conversation is over ${tokens(settings.maxContextTokens)} tokens (your setting: /boop big stop).`, { timeoutMs: 8000 })
  }
}

/** Re-sends the cached conversation with a one-word question and throws the reply away. */
async function boop($: $, origin: 'auto' | 'manual'): Promise<string> {
  if (isBusy) return 'Claude is working, so the cache is already being fed.'
  if (isBooping) return 'Already booping.'
  isBooping = true
  try {
    const r = await $.model.fork({ prompt: BOOP_PROMPT })
    if (!r.isAnswered && r.reason === 'nothing-to-fork') return 'Nothing to keep warm yet. Send a prompt first.'
    const u: Usage | undefined = 'usage' in r ? r.usage : undefined
    const win = windowNow()
    const now = await $.clock.now()
    if (u) {
      const cost = boopCostUsd(u, priceFor(rt.model, promptTokens(u), settings.prices), win.minutes)
      rt = { ...rt, session: addBoop(rt.session, cost), boopCostSinceReal: rt.boopCostSinceReal + cost }
      await addToAllTime($, addBoop(emptyTotals(), cost))
    }
    if (!r.isAnswered && u === undefined) {
      await saveRuntime($)
      return 'The boop did not reach Claude. Try again in a moment.'
    }
    rt = {
      ...rt,
      lastFedAt: now,
      fedUntil: now + FED_MS,
      boopsInRow: origin === 'auto' ? rt.boopsInRow + 1 : rt.boopsInRow,
      boopsSinceReal: rt.boopsSinceReal + 1,
      hungrySpellNotified: false,
    }
    await saveRuntime($)
    await refresh($)
    if (u && !isCached(u)) return 'Booped. The cache had already expired, so this boop rebuilt it.'
    return `Booped. Cache warm for ${win.minutes}:00.`
  } finally {
    isBooping = false
  }
}

async function setAuto($: $, auto: boolean) {
  await loadSettings($)
  settings = { ...settings, auto }
  if (auto) rt = { ...rt, boopsInRow: 0, capNotified: false }
  bigStopNotified = false
  $.ui.toast(
    auto
      ? `Auto-boop on: I'll keep your cache warm while you're away, ${awayText(settings.maxAwayMinutes)}.`
      : 'Auto-boop off.',
  )
  await saveSettings($)
}

async function patch($: $, p: Partial<Settings>) {
  await loadSettings($)
  settings = { ...settings, ...p }
  await saveSettings($)
}

function stats() {
  const win = windowNow()
  return statsText({
    session: rt.session,
    allTime,
    mode,
    hasPrices: priceFor(rt.model, rt.contextTokens, settings.prices) !== null,
    lastWasCached: rt.lastWasCached,
    windowMinutes: win.minutes,
    windowSource: win.source,
    auto: settings.auto,
  })
}

// ---------- drawing ----------

type Els = ReturnType<EngineInterface['ui']['resolve']>

function settingsRows(els: Els, $: $, s: Settings) {
  const { Box, Text, Button } = els
  const row = (label: string, options: { key: string; label: string; isOn: boolean; press: () => void }[]) => (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Box width={12} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      {options.map(o => (
        <Button key={o.key} label={o.label} variant={o.isOn ? 'primary' : 'secondary'} dimColor={!o.isOn} onPress={o.press} />
      ))}
    </Box>
  )
  return [
    row('Animal', (['bear', 'cat', 'dog'] as const).map(a => ({ key: `animal-${a}`, label: a[0]!.toUpperCase() + a.slice(1), isOn: s.animal === a, press: () => void patch($, { animal: a }) }))),
    row('Faces', (['text', 'emoji'] as const).map(st => ({ key: `style-${st}`, label: st === 'text' ? 'Text' : 'Emoji', isOn: s.style === st, press: () => void patch($, { style: st }) }))),
    row('Auto-boop', [true, false].map(v => ({ key: `auto-${v}`, label: v ? 'On' : 'Off', isOn: s.auto === v, press: () => void setAuto($, v) }))),
    row('Keep warm', ([0, 60, 120, NIGHT_MINUTES] as const).map(m => ({ key: `away-${m}`, label: m === 0 ? 'Always' : m === NIGHT_MINUTES ? 'Night' : `${m / 60}h`, isOn: s.maxAwayMinutes === m, press: () => void patch($, { maxAwayMinutes: m }) }))),
    row('Sound', [true, false].map(v => ({ key: `sound-${v}`, label: v ? 'On' : 'Off', isOn: s.sound === v, press: () => void patch($, { sound: v }) }))),
    row('Window', (['auto', 5, 60] as const).map(t => ({ key: `ttl-${t}`, label: t === 'auto' ? 'Auto' : `${t}m`, isOn: s.ttl === t, press: () => void patch($, { ttl: t }) }))),
  ]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadSettings($)
    allTime = sumTotals((await $.store.get('totals')) as Partial<Totals> | undefined, emptyTotals())
    mode = ((await $.store.get('billing')) as BillingMode | undefined) ?? 'api'
    const learned = ((await $.store.get('ttl')) ?? {}) as Record<string, 5 | 60>
    evidence.learned = learned[mode] ?? null
    rt = (await $.state.get(RUNTIME)).value ?? freshRuntime()
    sessionReady = true
    if (resumedAt !== null) await applyResume($)
    // v0.1.0 pinned a status entry; the CLI now shows the companion in the footer.
    $.ui.status(undefined)

    await $.command.register({
      name: 'boop',
      description: 'Feed your cache. Save your tokens.',
      argumentHint: '[settings | stats | auto on|off | help]',
    })

    if ((await $.store.get('welcomed')) !== true) {
      await $.store.set('welcomed', true)
      // One line: the transcript draws a log line without its line breaks.
      $.ui.log(
        `${faceFor(settings.animal, settings.style, 'fresh', 1000)} Hi, I'm your cache companion. I get hungry before your prompt cache expires. /boop settings to pick an animal, /boop auto on to keep the cache warm, /boop help for the rest.`,
      )
    }

    $.clock.every(1000, () => void refresh($))
    await refresh($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      rt = freshRuntime()
      await saveRuntime($)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && e.command === undefined && e.origin.kind !== 'plugin') {
      rt = onRealPrompt(rt)
      await saveRuntime($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) isBusy = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    isBusy = false
    await loadSettings($)
    const u = e.usage
    if (!u) {
      await refresh($)
      return result
    }

    // Subscriptions report usage-limit windows; API keys don't.
    const billing: BillingMode = (await $.session.usage()).rateLimits.length > 0 ? 'subscription' : 'api'
    if (billing !== mode) {
      mode = billing
      const learned = ((await $.store.get('ttl')) ?? {}) as Record<string, 5 | 60>
      evidence.learned = learned[mode] ?? null
      await $.store.set('billing', mode)
    }

    const now = await $.clock.now()
    const startedAt = now - e.durationMs
    const learned = learnWindow(rt.lastFedAt === null ? null : startedAt - rt.lastFedAt, u)
    if (learned !== null) await learn($, learned, false)

    const win = windowNow()
    const price = priceFor(u.model, promptTokens(u), settings.prices)
    const saved = turnSavedUsd(u, price)
    const prevented = preventedUsd(u, price, win.minutes, rt.lastRealTurnAt === null ? null : startedAt - rt.lastRealTurnAt, rt.boopsSinceReal)

    rt = {
      ...rt,
      session: addTurn(rt.session, u, saved, prevented),
      lastFedAt: now,
      lastRealTurnAt: now,
      fedUntil: now + FED_MS,
      contextTokens: promptTokens(u) + u.output_tokens,
      model: u.model,
      lastWasCached: isCached(u),
      boopsSinceReal: 0,
      boopCostSinceReal: 0,
      hungrySpellNotified: false,
    }
    await addToAllTime($, addTurn(emptyTotals(), u, saved, prevented))

    // Once per big spell: /compact (or anything that shrinks it) re-arms the notice.
    const isBig = rt.contextTokens > settings.maxContextTokens
    if (isBig && !rt.sizeNotified) $.ui.toast(bigNotice(rt.contextTokens, price, mode), { timeoutMs: 10000 })
    if (isBig !== rt.sizeNotified) rt = { ...rt, sizeNotified: isBig }
    if (!isBig) bigStopNotified = false
    await saveRuntime($)
    await refresh($)
    return result
  })

  // Exact window signals, where Claude Code shares them.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await learn($, e.cache_ttl === '1h' ? 60 : 5, true)
    await noteModel($, e.to_model, await $.clock.now())
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SessionStart', async ($, e, next) => {
    const w = windowFromResume(e.seconds_since_last_response, e.prompt_cache_likely_expired)
    if (w !== null) await learn($, w, true)
    // A resumed session: start the countdown from the real last reply.
    if (e.source === 'resume' || e.source === 'fork') {
      resumedAt = resumedFedAt(await $.clock.now(), e.seconds_since_last_response, e.prompt_cache_likely_expired)
      if (resumedAt !== null && sessionReady) await applyResume($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A subagent's reply reports which window its cache writes used.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    const usage = (r.result as { usage?: { cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null } } | undefined)?.usage
    const w = windowFromWrites(usage?.cache_creation)
    if (w !== null) await learn($, w, true)
    return r
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'boop' }, async ($, e) => {
    const [word = '', arg = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/)
    switch (word) {
      case '':
      case 'now':
        return { text: await boop($, 'manual') }
      case 'help':
        return { text: HELP }
      case 'stats':
        return { text: stats() }
      case 'settings':
        await $.ui.open({ id: PANE, title: 'Cache Companions', focus: true, closeOnEscape: true })
        return { text: 'Cache Companions settings opened.' }
      case 'auto':
      case 'sound': {
        if (arg !== 'on' && arg !== 'off') return { text: `Use /boop ${word} on or /boop ${word} off.` }
        if (word === 'auto') await setAuto($, arg === 'on')
        else await patch($, { sound: arg === 'on' })
        return { text: `${word === 'auto' ? 'Auto-boop' : 'Sound'} ${arg}.` }
      }
      case 'bear':
      case 'cat':
      case 'dog':
      case 'pup':
        await patch($, { animal: word })
        return { text: `Your companion is now a ${word}.` }
      case 'text':
      case 'emoji':
        await patch($, { style: word })
        return { text: `Faces: ${word}.` }
      case 'night':
        await patch($, { maxAwayMinutes: NIGHT_MINUTES })
        if (!settings.auto) await setAuto($, true)
        return { text: `Night mode: auto-boop keeps the cache warm ${awayText(NIGHT_MINUTES)}.` }
      case 'away': {
        const minutes = arg === 'off' || arg === '0' ? 0 : Number(arg)
        if (!Number.isFinite(minutes) || minutes < 0 || arg === '') return { text: 'Use /boop away <minutes>, e.g. /boop away 120, or /boop away off for no limit.' }
        await patch($, { maxAwayMinutes: Math.floor(minutes) })
        return { text: `Auto-boop keeps the cache warm ${awayText(Math.floor(minutes))}.` }
      }
      case 'big': {
        if (arg !== 'keep' && arg !== 'stop') return { text: 'Use /boop big keep (auto-boop big conversations too) or /boop big stop.' }
        await patch($, { stopWhenBig: arg === 'stop' })
        return { text: arg === 'stop' ? `Auto-boop stops past ${tokens(settings.maxContextTokens)} tokens.` : 'Auto-boop keeps going on big conversations.' }
      }
      case 'window':
      case 'ttl': {
        const ttl = arg === '5' ? 5 : arg === '60' ? 60 : arg === 'auto' ? 'auto' : null
        if (ttl === null) return { text: 'Use /boop window auto, 5 or 60.' }
        await patch($, { ttl })
        const win = windowNow()
        return { text: `Cache window: ${win.minutes} min${ttl === 'auto' ? ` (${win.source === 'assumed' ? 'assumed until detected' : 'detected'})` : ''}.` }
      }
      case 'price': {
        if (arg === 'reset') {
          await patch($, { prices: {} })
          return { text: 'Prices back to the built-in table.' }
        }
        const n = rest.map(Number)
        if (!arg || n.length !== 5 || n.some(x => !Number.isFinite(x) || x < 0)) {
          return { text: 'Use /boop price <model, e.g. opus-5-5> <input> <write5m> <write1h> <read> <output>, dollars per million tokens.' }
        }
        const [input = 0, write5m = 0, write1h = 0, readP = 0, output = 0] = n
        await patch($, { prices: { ...settings.prices, [arg]: { input, write5m, write1h, read: readP, output } } })
        return { text: `Price for ${arg} saved.` }
      }
      default:
        return { text: HELP }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const v = await read($, viewAtom)
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text>{v ? `${v.face}  ${v.summary}` : 'Cache Companions'}</Text>
        <Box flexDirection="column">{settingsRows(els, $, v ? v.settings : settings)}</Box>
        <Text dimColor>Esc closes. Settings are kept across sessions.</Text>
      </Box>
    )
  })

  // The CLI: the companion goes at the end of the hint line under the prompt.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const v = await read($, viewAtom)
    if (!v) return next(e)
    // Claude Code puts its own ` · ` before the tail.
    return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} · ${v.status}` : v.status } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The CLI shows the status entry instead of a band.
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)
    const v = await read($, viewAtom)
    if (!v) return next(e)
    const isOpen = await read($, panelAtom)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els

    // A short bar in one line; the surface's font sets its real width.
    const width = Math.max(8, Math.min(24, e.props.bodyColumns - 40))
    const filled = Math.round((v.fraction ?? 1) * width)
    const color = v.mood === 'hungry' ? 'error' : v.mood === 'peckish' ? 'warning' : v.mood === 'cold' ? 'inactive' : 'success'

    return (
      <Box key="cc-band" flexDirection="column" gap={1}>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <Button key="face" plain label={v.face} onPress={() => void update($, panelAtom, o => !o)} />
          <Box flexDirection="row" flexGrow={1} alignItems="center" gap={1} overflow="hidden">
            <Text color={color} wrap="truncate">
              {'━'.repeat(filled)}
            </Text>
            <Text dimColor wrap="truncate">
              {'─'.repeat(width - filled)}
            </Text>
            <Text dimColor tabular>
              {v.mood === 'cold' ? 'cold' : (v.clock ?? '')}
            </Text>
          </Box>
          <Button
            key="boop"
            label={v.auto ? '↻ Auto-Boop On' : 'Boop'}
            variant={v.auto ? 'primary' : 'secondary'}
            onPress={() => void (v.auto ? setAuto($, false) : boop($, 'manual'))}
          />
        </Box>
        <Box position="absolute" top={-2} left={0} display="none" hover={{ display: 'flex' }} paddingX={1} borderStyle="round">
          <Text size="caption">{v.summary}</Text>
        </Box>
        {isOpen ? (
          <Box flexDirection="column" gap={1}>
            <Text size="caption" dimColor>
              {v.summary}
            </Text>
            {settingsRows(els, $, v.settings)}
          </Box>
        ) : null}
      </Box>
    )
  })
}
