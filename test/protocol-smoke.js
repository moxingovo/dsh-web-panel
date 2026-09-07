'use strict'
// Headless smoke test of the P0 protocol client against the LIVE dsh service.
// Run: node test/protocol-smoke.js
const { DshClient } = require('../src/protocol')
const BASE = 'http://127.0.0.1:3080'
const CWD = process.env.DSH_SMOKE_CWD || require('node:os').homedir()
let failures = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' — ' + extra : ''))
  if (!cond) failures++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const client = new DshClient({ baseUrl: BASE, log: () => {} })
  const muxFrames = []
  client.on('mux', (f) => muxFrames.push(f))
  const desc = await client.request('host.describe', {})
  ok('host.describe', !!desc.version, 'version=' + desc.version)
  const presets = await client.request('agentPreset.list', {})
  ok('agentPreset.list', Array.isArray(presets.presets) && presets.presets.length >= 1, presets.presets.map((p) => p.id).join(','))
  const presetIds = presets.presets.map((p) => p.id)
  const presetA = presetIds[0]
  const presetB = presetIds.find((p) => p !== presetA) || presetA
  const created = await client.request('session.create', { cwd: CWD, agentPreset: presetA })
  ok('session.create', !!created.sessionId, created.sessionId)
  const sid = created.sessionId
  try {
    const sel = await client.request('agentPreset.select', { sessionId: sid, agentPreset: presetB })
    ok('C1 blank select', sel.agentPreset === presetB, 'selected ' + sel.agentPreset)
  } catch (e) {
    ok('C1 blank select', false, 'error: ' + e.message)
  }
  client.open()
  await sleep(1500)
  const prompt = await client.request('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '只回复“OK”两个字,不要做任何其他事。' }] })
  ok('session.prompt accepted', prompt.accepted === true)
  const deadline = Date.now() + 120000
  let sawUser = false, sawChunk = false, sawTurnStart = false
  while (Date.now() < deadline) {
    for (const f of muxFrames) {
      if (f.type === 'session/event' && f.sessionId === sid) {
        const ev = f.event
        if (ev.type === 'user/message') sawUser = true
        if (ev.type === 'turn/start') sawTurnStart = true
        if (ev.type === 'assistant/chunk') {
          const c = ev.data.chunk
          if (c.type === 'text-delta' || c.type === 'block-start') sawChunk = true
        }
      }
    }
    if (sawUser && sawChunk) break
    await sleep(300)
  }
  ok('stream user/message event', sawUser)
  ok('stream assistant chunk', sawChunk)
  ok('turn/start seen', sawTurnStart)
  try {
    await client.request('agentPreset.select', { sessionId: sid, agentPreset: presetA })
    ok('C1 locked after start', false, 'select unexpectedly succeeded')
  } catch (e) {
    ok('C1 locked after start', e.code === 'agent-preset-locked' || e.code === 'agent-preset-not-found', e.code + ': ' + e.message)
  }
  const cancelled = await client.request('session.cancel', { sessionId: sid })
  ok('session.cancel', cancelled.accepted === true)
  await sleep(2000)
  const arc = await client.request('workspace.archiveSession', { sessionId: sid })
  ok('archive (cleanup)', Array.isArray(arc.archivedSessionIds) && arc.archivedSessionIds.includes(sid), 'archived')
  client.close()
  console.log(failures === 0 ? '[SMOKE] ALL PASS' : '[SMOKE] FAIL count=' + failures)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error('[SMOKE] fatal:', e)
  process.exit(2)
})
