'use strict'
// DOM-level smoke of the webview UI (app.js + markdown.js) under jsdom.
// Drives the host-message protocol and asserts rendered DOM + outbound posts.
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM, VirtualConsole } = require('./ui-smoke/node_modules/jsdom')
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => console.log('[JSDOM-ERROR]', e && e.stack || e))
vc.on('error', (...a) => console.log('[JS-ERROR]', ...a.map((x) => x && x.stack || x)))

const ROOT = path.join(__dirname, '..')
const html = '<!DOCTYPE html><html><body><div id="app"></div></body></html>'
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/', runScripts: 'outside-only', virtualConsole: vc })
const { window } = dom
const { document } = window

const sent = []
window.acquireVsCodeApi = () => ({ postMessage: (m) => sent.push(m), getState: () => undefined, setState: () => {} })

const mdSrc = fs.readFileSync(path.join(ROOT, 'webview', 'markdown.js'), 'utf8')
const appSrc = fs.readFileSync(path.join(ROOT, 'webview', 'app.js'), 'utf8')
try {
  window.eval(mdSrc)
  window.eval(appSrc)
} catch (e) {
  console.error('[FATAL] eval error:', e)
  process.exit(1)
}

let failures = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' — ' + extra : ''))
  if (!cond) failures++
}
const post = (m) => window.dispatchEvent(Object.assign(new window.Event('message'), { data: m }))
const sentOf = (type) => sent.filter((m) => m.type === type)
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => Array.from(document.querySelectorAll(sel))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  // boot flow: app posts boot + lastSession
  ok('boot posts boot', sentOf('boot').length >= 1)
  post({ type: 'hello', port: 3080, version: '0.3.0' })
  post({ type: 'workspace', path: 'C:/Users/20906/Desktop/ds_harness' })
  post({ type: 'describe', describe: { version: '0.0.1', cwd: 'C:/x', provider: 'p', model: 'm' }, config: { port: 3080 } })
  post({ type: 'connection', state: 'connected' })
  post({ type: 'serverState', state: 'attached', label: 'attached :3080', error: '' })
  ok('skeleton rendered', !!$('.dsh-header') && !!$('.dsh-input'))
  ok('banner hidden when connected', $('.dsh-banner').hidden === true, 'hidden=' + $('.dsh-banner').hidden)

  // session list
  post({ type: 'sessionList', items: [
    { sessionId: 's1', updatedAt: Date.now(), running: false, blank: false, cwd: 'C:/Users/20906/Desktop/ds_harness', agentPreset: 'code', projections: { values: { title: '调研会话' } } },
    { sessionId: 's2', updatedAt: Date.now() - 10000, running: true, blank: true, cwd: 'C:/Users/20906/Desktop/ds_harness', agentPreset: 'standard', projections: {} },
    { sessionId: 's3', updatedAt: Date.now() - 20000, running: false, blank: false, cwd: 'C:/Users/20906/Desktop/other', agentPreset: 'code', projections: { values: { title: '别的目录' } } },
  ], archivedIds: [] })
  await sleep(50)
  const sb = document.querySelector('.sb-list')
  console.log('[DIAG] sb-list html: ' + String(sb ? sb.innerHTML : 'MISSING').slice(0, 400))
  console.log('[DIAG] sb-count: ' + String(document.querySelector('.sb-count') ? document.querySelector('.sb-count').textContent : '?'))
  console.log('[DIAG] sessions stored? ' + (document.querySelector('.sb-empty') ? 'EMPTY-VISIBLE' : 'no-empty'))
  ok('session list shows only workspace sessions', $$('.sb-row').length === 2, 'rows=' + $$('.sb-row').length)
  ok('projection title rendered', $$('.sb-row')[0].textContent.includes('调研会话'))

  // open session with real-ish history
  const hist = [
    { event: { type: 'turn/start', seq: 1, time: Date.now(), data: { turn: 1 } } },
    { event: { type: 'user/message', seq: 2, time: Date.now(), data: { message: { role: 'user', content: [{ type: 'text', text: '你好，请介绍**DSH**' }] } } } },
    { event: { type: 'assistant/chunk', seq: 3, time: Date.now(), data: { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } } } },
    { event: { type: 'assistant/chunk', seq: 4, time: Date.now(), data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '你好！' } } } },
    { event: { type: 'assistant/chunk', seq: 5, time: Date.now(), data: { turn: 1, step: 1, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: '你好！' } } } } },
    { event: { type: 'tool/call', seq: 6, time: Date.now(), data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"a.txt"}' } } },
    { event: { type: 'tool/code-dispatch', seq: 7, time: Date.now(), data: { rootCallId: 'c1', parentCallId: 'c1', subCallId: 'c1:code:1', name: 'read', arguments: { file_path: 'a.txt' }, content: [{ type: 'text', text: 'file text' }] } } },
    { event: { type: 'tool/result', seq: 8, time: Date.now(), data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'RESULT: ok' }] }] } } } },
    { event: { type: 'todo/write', seq: 9, time: Date.now(), data: { todos: [{ id: 't1', content: '写代码', status: 'in_progress' }, { id: 't2', content: '测试', status: 'completed' }] } } },
    { event: { type: 'approval/asked', seq: 10, time: Date.now(), data: { approvalId: 'ap1', toolName: 'run_code', reason: 'Will run' } } },
    { event: { type: 'request/context', seq: 11, time: Date.now(), data: { contextWindow: 1000000 } } },
    { event: { type: 'turn/end', seq: 12, time: Date.now(), data: { turn: 1 } } },
  ]
  post({ type: 'sessionOpened', sessionId: 's1', events: hist, projections: { asOfSeq: 12, values: { tokenUsage: { uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0 }, contextPressure: { pressureTokens: 460000, contextWindow: 1000000 } } }, hasMore: false, blank: false, models: null, presets: { presets: [] } })
  await sleep(50)
  ok('user message rendered', $$('.msg.user .md').length === 1 && $$('.msg.user .md')[0].textContent.includes('你好'))
  ok('assistant text rendered', $$('.msg.assistant .textblock').length === 1 && $$('.msg.assistant .textblock')[0].textContent.includes('你好'))
  ok('tool card rendered', $$('.tool-card').length === 1 && $$('.tool-card')[0].textContent.includes('read'))
  ok('tool result attached', $$('.tool-card')[0].textContent.includes('RESULT: ok'))
  ok('todo card rendered', $$('.todo-card').length === 1)
  ok('approval card rendered', $$('.approval-card').length === 1 && $$('.approval-actions .btn').length === 2)
  ok('context meter ring', (() => {
    const arc = $('.cm-arc')
    if (!arc) return false
    return parseFloat(arc.getAttribute('stroke-dasharray') || '0') > 0
  })(), 'ring dasharray set')
  ok('preset pill locked after start', $('#presetPill').disabled === true && $('#presetPill').textContent.includes('预设:'))
  ok('send idle (no stop state)', !$('#btnSend').classList.contains('stop'))

  // live streaming patch
  post({ type: 'frame', kind: 'mux', frame: { type: 'session/event', sessionId: 's1', rpcId: 'r1', event: { type: 'turn/start', seq: 13, time: Date.now(), data: { turn: 2 } } } })
  post({ type: 'frame', kind: 'mux', frame: { type: 'session/event', sessionId: 's1', rpcId: 'r2', event: { type: 'assistant/chunk', seq: 14, time: Date.now(), data: { turn: 2, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } } } } })
  post({ type: 'frame', kind: 'mux', frame: { type: 'session/event', sessionId: 's1', rpcId: 'r3', event: { type: 'assistant/chunk', seq: 15, time: Date.now(), data: { turn: 2, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: 'think…' } } } } })
  post({ type: 'frame', kind: 'mux', frame: { type: 'session/event', sessionId: 's1', rpcId: 'r4', event: { type: 'assistant/chunk', seq: 16, time: Date.now(), data: { turn: 2, step: 1, chunk: { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think…' } } } } } })
  await sleep(50)
  ok('live reasoning streamed', $$('.reasoning.done').length >= 1 && $$('.reasoning')[0].textContent.includes('think'), $$('.reasoning').length)
  ok('turn/start switches send to stop', $('#btnSend').classList.contains('stop'))

  // approval respond via live frame
  post({ type: 'frame', kind: 'mux', frame: { type: 'approval/requested', sessionId: 's1', rpcId: 'ap-rpc', approvalId: 'ap-live', toolName: 'shell', reason: 'run cmd' } })
  await sleep(30)
  const liveCard = $$('.approval-card').find((c) => c.textContent.includes('ap-live') || c.textContent.includes('shell'))
  ok('live approval card', !!liveCard)
  const allow = liveCard && liveCard.querySelector('.btn.success')
  if (allow) allow.dispatchEvent(new window.Event('click'))
  await sleep(30)
  const resp = sentOf('approvalRespond').pop()
  ok('approval respond posted', resp && resp.approvalId === 'ap-live' && resp.outcome === 'allowed-once' && resp.rpcId === 'ap-rpc', JSON.stringify(resp))

  // composer: keydown Enter sends prompt with mode steer (busy)
  const input = $('.dsh-input')
  input.value = '来一个能说话的机器人'
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(30)
  const prompt = sentOf('prompt').pop()
  ok('prompt posted on Enter', !!prompt && prompt.content && prompt.content[0].text === '来一个能说话的机器人')
  ok('prompt mode steer while busy', prompt && prompt.mode === 'steer')

  // cancel post
  $('#btnSend').dispatchEvent(new window.Event('click'))
  await sleep(30)
  ok('cancel posted', sentOf('cancel').length >= 1 && sentOf('cancel').pop().sessionId === 's1')

  console.log(failures === 0 ? '[UI] ALL PASS' : '[UI] FAIL count=' + failures)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('[UI] fatal:', e); process.exit(2) })
