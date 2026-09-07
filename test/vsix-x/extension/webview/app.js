'use strict'
// DSH native sidebar front-end (Claude Code style, 100% VS Code theme vars).
// Talks to the extension host via postMessage; all server I/O goes through
// the host (path B: webview ↔ extension.js ↔ dsh service on 3080).
// Wire semantics per src/protocol.js (rc.5 contract).
;(() => {
  const vscode = acquireVsCodeApi()
  const $ = (sel) => document.querySelector(sel)
  const md = window.DshMarkdown
  const S = {
    conn: 'connecting',
    server: { state: 'idle', label: '', error: '' },
    wsPath: null,
    describe: null,
    config: null,
    dshHome: null,
    sessions: [],
    archived: new Set(),
    openId: null,
    open: null,
    pending: new Map(),      // rpcId -> { kind, sessionId, payload }
    settingsOpen: false,
    timelineOpen: false,
    lastSessionId: null,
    needScroll: true,
  }
  const fmtTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    }
    return (d.getMonth() + 1) + '/' + d.getDate()
  }
  const fmtNum = (n) => {
    if (n === undefined || n === null) return '–'
    if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k'
    return String(n)
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild) }
  function post(msg) { vscode.postMessage(msg) }
  function esc(s) { return md.escapeHtml(s) }

  function bootSkeleton() {
    const app = $('#app')
    clear(app)
    const root = el('div', 'dsh-root')
    root.innerHTML =
      '<header class="dsh-header">' +
      '  <div class="brand" title="DeepSeek Harness 原生侧边栏">DSH</div>' +
      '  <div class="hdr-selects"></div>' +
      '  <div class="hdr-actions">' +
      '    <button class="iconbtn" id="btnNewSession" title="新会话">&#10010;</button>' +
      '    <button class="iconbtn" id="btnTimeline" title="时间线">&#9201;</button>' +
      '    <button class="iconbtn" id="btnSettings" title="设置">&#9881;</button>' +
      '    <button class="iconbtn" id="btnCollapse" title="收起侧边栏">&#187;</button>' +
      '  </div>' +
      '</header>' +
      '<section class="dsh-sessionbar"><div class="sb-head"><span>会话</span><span class="sb-count"></span></div><div class="sb-list"></div></section>' +
      '<main class="dsh-main">' +
      '  <div class="dsh-banner" hidden></div>' +
      '  <div class="dsh-messages"></div>' +
      '  <div class="dsh-empty" hidden></div>' +
      '  <div class="dsh-composer">' +
      '    <div class="attach-tray" hidden></div>' +
      '    <textarea class="dsh-input" rows="1" placeholder="输入消息，Enter 发送，Shift+Enter 换行"></textarea>' +
      '    <div class="composer-row">' +
      '      <div class="context-meter" title="会话上下文用量"><div class="cm-bar"><div class="cm-fill"></div></div><span class="cm-label"></span></div>' +
      '      <button class="iconbtn" id="btnAttach" title="添加图片">&#128206;</button>' +
      '      <button class="iconbtn" id="btnCompact" title="压缩会话">压缩</button>' +
      '      <button class="btn primary" id="btnSend">发送</button>' +
      '      <button class="btn danger" id="btnStop" hidden>停止</button>' +
      '    </div>' +
      '  </div>' +
      '</main>' +
      '<aside class="dsh-settings" hidden></aside>'
    app.appendChild(root)
    const selHost = $('.hdr-selects')
    selHost.innerHTML =
      '<select id="modelSel" class="hdr-sel" title="模型"></select>' +
      '<select id="effortSel" class="hdr-sel" title="推理档位"></select>' +
      '<select id="presetSel" class="hdr-sel" title="预设(仅空白会话可切换)"></select>'
    bindHeader()
    bindComposer()
  }

  function bindHeader() {
    $('#btnNewSession').addEventListener('click', () => post({ type: 'createSession', cwd: S.wsPath }))
    $('#btnTimeline').addEventListener('click', () => { S.timelineOpen = !S.timelineOpen; renderTimelinePanel() })
    $('#btnSettings').addEventListener('click', () => { S.settingsOpen = !S.settingsOpen; renderSettings() })
    $('#btnCollapse').addEventListener('click', () => post({ type: 'collapse' }))
    $('#modelSel').addEventListener('change', (e) => {
      const i = Number(e.target.value)
      const m = S.open && S.open.modelList ? S.open.modelList[i] : null
      if (!m) return
      post({ type: 'selectModel', sessionId: S.openId, provider: m.provider, model: m.model, reasoningEffort: m.reasoningEffort })
    })
    $('#effortSel').addEventListener('change', (e) => {
      const m = currentModel()
      if (!m) return
      post({ type: 'selectModel', sessionId: S.openId, provider: m.provider, model: m.model, reasoningEffort: e.target.value })
    })
    $('#presetSel').addEventListener('change', (e) => {
      const preset = e.target.value
      if (!preset) return
      post({ type: 'selectPreset', sessionId: S.openId, agentPreset: preset })
    })
  }

  function bindComposer() {
    const input = $('.dsh-input')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        sendPrompt()
      }
    })
    input.addEventListener('input', () => {
      input.style.height = 'auto'
      input.style.height = Math.min(200, input.scrollHeight) + 'px'
    })
    $('#btnSend').addEventListener('click', sendPrompt)
    $('#btnStop').addEventListener('click', () => post({ type: 'cancel', sessionId: S.openId }))
    $('#btnAttach').addEventListener('click', () => {
      const fi = document.createElement('input')
      fi.type = 'file'
      fi.accept = 'image/png,image/jpeg,image/webp,image/gif'
      fi.multiple = true
      fi.addEventListener('change', async () => {
        for (const f of fi.files) await addAttachment(f)
      })
      fi.click()
    })
    $('#btnCompact').addEventListener('click', () => post({ type: 'compact', sessionId: S.openId }))
    $('.dsh-messages').addEventListener('scroll', () => {
      const m = $('.dsh-messages')
      S.needScroll = m.scrollTop + m.clientHeight > m.scrollHeight - 60
    })
  }

  const attachments = []
  async function addAttachment(file) {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const mediaType = file.type || 'image/png'
    let data = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      data += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    }
    const base64 = btoa(data)
    attachments.push({ type: 'image', mediaType, data: base64, name: file.name })
    const tray = $('.attach-tray')
    tray.hidden = false
    const chip = el('span', 'attach-chip', file.name)
    const x = el('button', 'chip-x', '×')
    x.addEventListener('click', () => {
      const i = attachments.findIndex((a) => a.name === file.name)
      if (i >= 0) attachments.splice(i, 1)
      chip.remove()
      if (!attachments.length) tray.hidden = true
    })
    chip.appendChild(x)
    tray.appendChild(chip)
  }

  function currentModel() {
    const o = S.open
    if (!o || !o.models) return null
    return o.models.current || null
  }
  function currentEffort() {
    const m = currentModel()
    return m && m.reasoningEffort ? m.reasoningEffort : undefined
  }
  function addRow(node) {
    const m = $('.dsh-messages')
    m.appendChild(node)
    if (S.needScroll) m.scrollTop = m.scrollHeight
  }

  // ── host messages ─────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => handle(e.data || {}))

  function handle(m) {
    switch (m.type) {
      case 'hello':
        S.conn = 'connecting'
        break
      case 'workspace':
        S.wsPath = m.path
        break
      case 'describe':
        S.describe = m.describe
        S.config = m.config
        break
      case 'connection':
        S.conn = m.state
        renderBanner()
        break
      case 'serverState':
        S.server = { state: m.state, label: m.label, error: m.error || '' }
        renderBanner()
        break
      case 'sessionList':
        S.sessions = m.items || []
        S.archived = new Set(m.archivedIds || [])
        renderSessionList()
        // A2: 记住上次会话,自动恢复
        if (!S.openId && S.lastSessionId && S.conn === 'connected') {
          const it = workspaceSessions().find((s) => s.sessionId === S.lastSessionId)
          if (it) post({ type: 'openSession', sessionId: it.sessionId })
        }
        break
      case 'sessionCreated':
        post({ type: 'openSession', sessionId: m.sessionId })
        break
      case 'sessionOpened':
        openSessionView(m)
        break
      case 'historyPage':
        prependHistory(m)
        break
      case 'sessionClosed':
        if (S.openId === m.sessionId) { S.openId = null; S.open = null; renderAll() }
        break
      case 'frame':
        try { onFrame(m.kind, m.frame) } catch (err) { console.error('[frame-error]', err && err.stack || err) }
        break
      case 'promptAccepted':
        if (m.command && m.command.text) pushSystemRow(m.command.text)
        break
      case 'cancelled':
        pushSystemRow('已停止')
        break
      case 'modelSelected':
        if (S.open && S.open.models) S.open.models.current = m.selected
        renderHeaderSelects()
        break
      case 'presetSelected':
        if (S.open) S.open.preset = m.agentPreset
        renderHeaderSelects()
        break
      case 'sessionRenamed':
        pushSystemRow('已重命名为「' + m.title + '」')
        break
      case 'sessionArchived':
        S.archived = new Set(m.archivedIds || [])
        removeSessionRow(m.sessionId)
        break
      case 'sessionForked':
        post({ type: 'openSession', sessionId: m.sessionId })
        break
      case 'settings':
        S.config = m.config
        S.dshHome = m.dshHome
        renderSettings()
        break
      case 'error':
        pushSystemRow('错误: ' + m.message)
        break
      case 'reload':
        post({ type: 'boot' })
        break
      case 'configChanged':
        S.config = m.config
        break
      case 'lastSession':
        S.lastSessionId = m.sessionId || null
        if (S.lastSessionId && !S.openId) {
          const it = workspaceSessions().find((s) => s.sessionId === S.lastSessionId)
          if (it) post({ type: 'openSession', sessionId: it.sessionId })
        }
        break
      default:
        return
    }
  }
  // ── session list (A5 仅当前工作区 + A3 最近活动降序) ──────────────────────
  function workspaceSessions() {
    const pathNorm = (p) => p ? String(p).replace(/[\\/]+$/, '').toLowerCase() : p
    const ws = pathNorm(S.wsPath)
    let items = S.sessions.filter((s) => !S.archived.has(s.sessionId))
    if (ws && S.wsPath) items = items.filter((s) => pathNorm(s.cwd) === ws)
    items = items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return items
  }

  function renderSessionList() {
    const list = $('.sb-list')
    clear(list)
    const items = workspaceSessions()
    $('.sb-count').textContent = String(items.length)
    if (!items.length) {
      const none = el('div', 'sb-empty', S.wsPath ? '本工作区还没有会话' : '没有会话(未打开工作区)')
      list.appendChild(none)
      return
    }
    for (const it of items) {
      const row = el('div', 'sb-row' + (it.sessionId === S.openId ? ' active' : ''))
      row.title = (it.cwd || '') + ' · ' + it.sessionId
      const projTitle = it.projections && it.projections.values && it.projections.values.title
      const title = it.sessionId === S.openId && S.open && S.open.title ? S.open.title : (projTitle || it.title || it.name)
      const head = el('div', 'sb-titleline')
      const name = el('span', 'sb-name', title || '新会话' + (it.blank ? '' : ' (无标题)'))
      head.appendChild(name)
      if (it.running) head.appendChild(el('span', 'sb-dot running', '运行中'))
      row.appendChild(head)
      const sub = el('div', 'sb-subline')
      sub.appendChild(el('span', 'sb-time', fmtTime(it.updatedAt)))
      if (it.agentPreset) sub.appendChild(el('span', 'sb-chip', it.agentPreset))
      const count = el('span', 'sb-count-chip', it.messages ? String(it.messages) : '')
      if (it.messages) sub.appendChild(count)
      row.appendChild(sub)
      row.addEventListener('click', () => {
        if (S.openId !== it.sessionId) post({ type: 'openSession', sessionId: it.sessionId })
      })
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        showSessionMenu(e, it)
      })
      list.appendChild(row)
    }
  }

  function showSessionMenu(e, it) {
    const menu = el('div', 'ctx-menu')
    const mk = (label, fn) => {
      const b = el('button', 'ctx-item', label)
      b.addEventListener('click', () => { menu.remove(); fn() })
      menu.appendChild(b)
      return b
    }
    mk('重命名', () => {
      const t = prompt('新标题', it.title || '')
      if (t !== null) post({ type: 'renameSession', sessionId: it.sessionId, title: t })
    })
    mk('归档', () => post({ type: 'archiveSession', sessionId: it.sessionId }))
    mk('派生新会话(fork)', () => post({ type: 'forkSession', sessionId: it.sessionId }))
    if (it.running) mk('停止', () => post({ type: 'cancel', sessionId: it.sessionId }))
    document.body.appendChild(menu)
    menu.style.left = Math.min(e.clientX, window.innerWidth - 140) + 'px'
    menu.style.top = Math.min(e.clientY, window.innerHeight - 140) + 'px'
    setTimeout(() => {
      const off = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', off) } }
      document.addEventListener('click', off)
    }, 0)
  }

  function removeSessionRow(sessionId) {
    S.sessions = S.sessions.filter((s) => s.sessionId !== sessionId)
    renderSessionList()
  }

  // ── open session ──────────────────────────────────────────────────────────
  function openSessionView(m) {
    S.openId = m.sessionId
    S.open = {
      id: m.sessionId,
      rows: [],
      title: null,
      hasMore: m.hasMore,
      blank: m.blank,
      models: m.models,
      modelList: flatModels(m.models),
      presets: m.presets || { presets: [] },
      preset: null,
      projections: m.projections ? m.projections.values || {} : {},
      projectionAsOf: m.projections ? m.projections.asOfSeq : -1,
      busy: false,
      queue: [],
      approvals: new Map(),
      timeline: [],
      stream: null,
      contextWindow: null,
    }
    if (m.events.length > 400) {
      const cut = m.events.length - 400
      S.open.skipped = cut
      foldHistoryEvents(m.events.slice(cut))
    } else {
      S.open.skipped = 0
      foldHistoryEvents(m.events)
    }
    renderAll()
    post({ type: 'lastSession', sessionId: m.sessionId })
  }

  function flatModels(models) {
    if (!models) return []
    const out = []
    for (const g of models.groups || []) {
      for (const mdl of g.models || []) {
        out.push({ provider: g.id, model: mdl.id, name: mdl.name || mdl.id, reasoning: mdl.reasoning || null })
      }
    }
    return out
  }

  function foldHistoryEvents(events) {
    if (!S.open) return
    const rows = S.open.rows
    for (const entry of events) {
      foldEvent(entry.event, entry.view, rows)
    }
    if (S.open.stream && S.open.stream.assistant) {
      finalizeStreamingAssistant(S.open.stream.assistant)
      S.open.stream = null
    }
  }

  function foldEvent(ev, view, rows) {
    const d = ev.data || {}
    const t = ev.type
    S.open.timeline.push({ seq: ev.seq, time: ev.time, type: t })
    switch (t) {
      case 'turn/start':
        S.open.busy = true
        S.open.stream = { turn: d.turn, assistant: null, blocks: new Map(), tools: new Map(), lastStep: 0 }
        break
      case 'turn/end':
        S.open.busy = false
        if (S.open.stream && S.open.stream.assistant) finalizeStreamingAssistant(S.open.stream.assistant)
        S.open.stream = null
        break
      case 'step/start':
        if (S.open.stream) S.open.stream.lastStep = d.step
        break
      case 'user/message': {
        const row = { kind: 'user', parts: partsOf(d.message && d.message.content), ts: ev.time }
        rows.push(row)
        break
      }
      case 'assistant/chunk':
        foldChunk(d, rows)
        break
      case 'assistant/message': {
        const st = S.open.stream
        const content = d.message && d.message.content
        const row = st && st.assistant ? st.assistant : { kind: 'assistant', blocks: [], ts: ev.time }
        row.blocks = (content || []).filter((b) => b.type !== 'tool-call').map((b) => ({
          type: b.type === 'reasoning' ? 'reasoning' : 'text',
          text: typeof b.text === 'string' ? b.text : '',
        }))
        if (row._built) renderAssistantBlocks(row)
        if (!st || !st.assistant) rows.push(row)
        if (st) st.assistant = null
        break
      }
      case 'tool/call': {
        const id = d.callId
        const pending = S.open.stream && S.open.stream.tools.get(id)
        if (pending) {
          pending.name = d.name
          pending.args = d.arguments
          break
        }
        const row = { kind: 'tool', callId: id, name: d.name, args: d.arguments, status: 'running', resultText: '', dispatches: [], ts: ev.time, view: view || null }
        rows.push(row)
        break
      }
      case 'tool/result': {
        const callId = d.message && d.message.source && d.message.source.callId
        const row = findToolRow(rows, callId)
        if (row) {
          row.status = 'ok'
          row.resultText = resultTextOf(d.message && d.message.content)
          if (row._built) renderToolResult(row)
        }
        break
      }
      case 'tool/code-dispatch-start':
      case 'tool/code-dispatch': {
        const callId = d.rootCallId || d.parentCallId
        const row = findToolRow(rows, callId)
        if (row) {
          row.dispatches.push({
            name: d.name,
            path: pathOfArgs(d.arguments),
            preview: previewOf(d.content),
            isError: !!d.isError,
            content: contentTextOf(d.content),
          })
          if (row._built) renderToolDispatches(row)
        }
        break
      }
      case 'todo/write': {
        const items = (d.todos || d.items || d.tasks || []).map((it) => ({
          id: it.id || it.content || '',
          content: it.content || it.title || it.text || '',
          status: it.status || '',
        }))
        if (items.length) rows.push({ kind: 'todo', items, ts: ev.time })
        break
      }
      case 'approval/asked':
        rows.push({ kind: 'approval', approvalId: d.approvalId, toolName: d.toolName || '', reason: d.reason || '', decided: false, outcome: null, ts: ev.time })
        break
      case 'approval/decided': {
        const last = [...rows].reverse().find((r) => r.kind === 'approval' && r.approvalId === d.approvalId)
        if (last) { last.decided = true; last.outcome = d.outcome; if (last._built) renderApprovalRow(last) }
        break
      }
      case 'compaction/summary':
        rows.push({ kind: 'system', text: '已压缩: ' + String(d.summary || d.text || '会话历史已压缩'), ts: ev.time })
        break
      case 'compaction/prune':
        rows.push({ kind: 'system', text: '已修剪工具结果(' + (d.shadowedToolResults ?? d.items ?? '?') + ')', ts: ev.time })
        break
      case 'compaction/start':
        rows.push({ kind: 'system', text: '开始压缩会话…', ts: ev.time })
        break
      case 'session/title':
        if (S.open) { S.open.title = d.title || null }
        break
      case 'plan/mode':
        rows.push({ kind: 'system', text: '计划模式: ' + (d.active ? '已开启' : '已关闭'), ts: ev.time })
        break
      case 'request/context':
        if (d && d.contextWindow) S.open.contextWindow = d.contextWindow
        break
      default:
        break
    }
  }

  function foldChunk(d, rows) {
    const st = S.open.stream
    if (!st) return
    const c = d.chunk || {}
    const index = c.index === undefined ? 0 : c.index
    if (c.type === 'block-start') {
      if (!st.assistant) {
        st.assistant = { kind: 'assistant', blocks: [], ts: Date.now(), _streamParts: new Map(), _built: false }
        rows.push(st.assistant)
      }
      st.lastBlockType = c.blockType
      st.blocks.set(index, { type: c.blockType === 'reasoning' ? 'reasoning' : c.blockType === 'tool-call' || c.blockType === 'tool' ? 'tool' : 'text', text: '', assembled: null })
      return
    }
    if (c.type === 'text-delta' || c.type === 'reasoning-delta') {
      const b = st.blocks.get(index)
      if (b) { b.text += c.text; streamDelta(st, index, c.text, c.type === 'reasoning-delta' ? 'reasoning' : 'text') }
      return
    }
    if (c.type === 'tool-call-delta') {
      const b = st.blocks.get(index)
      if (b) { b.text += c.argumentsDelta || ''; b.toolId = c.id; b.toolName = c.name }
      return
    }
    if (c.type === 'block-end') {
      const block = c.block || {}
      const existing = st.blocks.get(index)
      if (block.type === 'tool-call' || block.type === 'tool') {
        const row = { kind: 'tool', callId: block.id, name: block.name, args: block.arguments, status: 'running', resultText: '', dispatches: [], ts: Date.now(), view: null }
        if (st.tools) st.tools.set(block.id, row)
        rows.push(row)
        st.blocks.delete(index)
        return
      }
      if (existing) {
        existing.assembled = block
        existing.text = typeof block.text === 'string' ? block.text : existing.text
        blockDone(st, index, existing)
      }
      return
    }
  }

  function findToolRow(rows, callId) {
    if (!callId) return null
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.kind === 'tool' && (r.callId === callId || (callId.startsWith(r.callId || '') && (callId.includes(':code:') || callId.startsWith(r.callId + ':'))))) return r
    }
    return null
  }

  function partsOf(content) {
    return (content || []).flatMap((b) => b.type === 'text' ? [{ type: 'text', text: b.text }] : b.type === 'image' ? [{ type: 'image', name: b.name || '图片', hasData: false }] : [])
  }
  function resultTextOf(content) {
    const txt = contentTextOf(content)
    return txt.length > 300 ? txt.slice(0, 300) + '…' : txt
  }
  function contentTextOf(content) {
    return (content || []).map((b) => (typeof b.text === 'string' ? b.text : b.type === 'tool-result' ? (b.content || []).map((x) => x.text || '').join('\\n') : '')).join('\\n')
  }
  function pathOfArgs(args) {
    if (typeof args === 'string') { try { const o = JSON.parse(args); return o.file_path || o.path || '' } catch { return '' } }
    return (args && args.file_path) || (args && args.path) || ''
  }
  function previewOf(content) {
    const t = contentTextOf(content)
    return t.length > 160 ? t.slice(0, 160) + '…' : t
  }
  // ── row rendering (live + history, theme-variable based) ──────────────────
  function renderRow(row) {
    let node = null
    switch (row.kind) {
      case 'user': {
        const wrap = el('div', 'msg user')
        const meta = el('div', 'msg-meta', '你')
        wrap.appendChild(meta)
        const body = el('div', 'msg-body')
        for (const p of row.parts || []) {
          if (p.type === 'text' && p.text) {
            const d = el('div', 'md', '')
            d.innerHTML = md.render(p.text)
            wireMd(d)
            body.appendChild(d)
          }
          if (p.type === 'image') body.appendChild(el('div', 'img-chip', '📷 ' + (p.name || '图片')))
        }
        wrap.appendChild(body)
        // 重新发送(预填编辑器编辑后发送,需求 v0.2-18 轻量实现)
        const act = el('div', 'msg-actions')
        const resend = el('button', 'act-btn', '重新发送')
        resend.title = '将这条消息填入输入框,编辑后按 Enter 重发'
        resend.addEventListener('click', () => {
          const text = (row.parts || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n')
          const input = $('.dsh-input')
          input.value = text
          input.focus()
          input.style.height = 'auto'
          input.style.height = Math.min(200, input.scrollHeight) + 'px'
        })
        act.appendChild(resend)
        wrap.appendChild(act)
        node = wrap
        break
      }
      case 'assistant':
        node = renderAssistant(row)
        break
      case 'tool':
        node = renderTool(row)
        break
      case 'todo':
        node = renderTodo(row)
        break
      case 'approval':
        node = renderApproval(row)
        break
      case 'system': {
        node = el('div', 'msg system')
        node.appendChild(el('div', 'md', row.text || ''))
        break
      }
      default:
        node = el('div', 'msg system', '')
    }
    row._built = true
    row._dom = node
    return node
  }

  function renderAssistant(row) {
    const wrap = el('div', 'msg assistant')
    const meta = el('div', 'msg-meta', 'DSH')
    wrap.appendChild(meta)
    const body = el('div', 'msg-body')
    wrap.appendChild(body)
    const act = el('div', 'msg-actions')
    const copy = el('button', 'act-btn', '复制')
    copy.addEventListener('click', () => {
      const text = (row.blocks || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n')
      post({ type: 'copyText', text })
    })
    act.appendChild(copy)
    wrap.appendChild(act)
    row._body = body
    row._parts = new Map()
    row._streamNodes = new Map()
    renderAssistantBlocks(row)
    return wrap
  }

  function renderAssistantBlocks(row) {
    const body = row._body
    if (!body) return
    clear(body)
    row._parts = row._parts || new Map()
    row._parts.clear()
    for (const b of row.blocks) {
      if (b.type === 'tool') continue
      if (b.type === 'reasoning') {
        const det = el('details', 'reasoning')
        const sum = el('summary', '', shortText(b.text || '推理过程'))
        det.appendChild(sum)
        const inner = el('div', 'reasoning-content md', '')
        inner.innerHTML = md.render(b.text || '')
        wireMd(inner)
        det.appendChild(inner)
        body.appendChild(det)
      } else {
        const div = el('div', 'md textblock', '')
        div.innerHTML = md.render(b.text || '')
        wireMd(div)
        body.appendChild(div)
      }
    }
  }
  function shortText(t) {
    const s = String(t || '').replace(/\\s+/g, ' ').trim()
    return s.length > 90 ? s.slice(0, 90) + '…' : s
  }

  function renderTool(row) {
    const wrap = el('div', 'tool-card' + (row.status === 'running' ? ' running' : row.status === 'err' ? ' err' : ''))
    const head = el('div', 'tool-head')
    const icon = el('span', 'tool-icon', row.status === 'running' ? '⟳' : row.status === 'err' ? '✗' : '✓')
    head.appendChild(icon)
    head.appendChild(el('span', 'tool-name', row.name || (row.view && row.view.title) || '工具'))
    if (row.view && row.view.kind) head.appendChild(el('span', 'tool-kind', String(row.view.kind)))
    if (row.status === 'running') head.appendChild(el('span', 'tool-spin', '运行中…'))
    const toggle = el('button', 'tool-toggle', '详情')
    toggle.addEventListener('click', () => { wrap.classList.toggle('open') })
    head.appendChild(toggle)
    wrap.appendChild(head)
    const detail = el('div', 'tool-detail')
    detail.hidden = true
    const mdArgs = el('div', 'tool-args')
    mdArgs.textContent = prettyArgs(row)
    detail.appendChild(mdArgs)
    const disp = el('div', 'tool-dispatch')
    detail.appendChild(disp)
    const res = el('div', 'tool-result')
    detail.appendChild(res)
    wrap.appendChild(detail)
    row._detail = { wrap, detail, disp, res }
    renderToolDispatches(row)
    renderToolResult(row)
    return wrap
  }
  function prettyArgs(row) {
    let args = row.args
    if (typeof args === 'string') {
      try { args = JSON.parse(args) } catch {}
    }
    if (typeof args === 'object' && args !== null) return JSON.stringify(args, null, 2)
    return String(args || '')
  }
  function renderToolDispatches(row) {
    const d = row._detail
    if (!d) return
    clear(d.disp)
    for (const entry of (row.dispatches || [])) {
      const line = el('div', 'dispatch-line' + (entry.isError ? ' err' : ''))
      const icon = el('span', 'disp-icon', entry.isError ? '✗' : '·')
      line.appendChild(icon)
      line.appendChild(el('span', 'disp-name', entry.name))
      if (entry.path) line.appendChild(el('span', 'disp-path', entry.path))
      line.title = entry.preview || entry.content || ''
      d.disp.appendChild(line)
    }
  }
  function renderToolResult(row) {
    const d = row._detail
    if (!d) return
    clear(d.res)
    if (row.status !== 'running' && row.resultText) {
      const pre = el('pre', 'result-text', row.resultText.length > 1200 ? row.resultText.slice(0, 1200) + '\\n…' : row.resultText)
      d.res.appendChild(pre)
    } else {
      d.res.textContent = ''
      if (row.status === 'running') d.res.textContent = 'tool result 尚未返回…'
    }
  }

  function renderTodo(row) {
    const wrap = el('div', 'todo-card')
    const head = el('div', 'todo-head', '任务清单')
    wrap.appendChild(head)
    const list = el('div', 'todo-items')
    for (const it of row.items || []) {
      const line = el('div', 'todo-item ' + (it.status || ''))
      const mark = el('span', 'todo-mark', it.status === 'completed' || it.status === 'done' ? '✓' : '○')
      line.appendChild(mark)
      line.appendChild(el('span', 'todo-text', it.content))
      list.appendChild(line)
    }
    wrap.appendChild(list)
    return wrap
  }

  function renderApproval(row) {
    const wrap = el('div', 'approval-card')
    const head = el('div', 'approval-head')
    head.appendChild(el('span', 'approval-icon', '⚠'))
    head.appendChild(el('span', 'approval-title', '权限请求: ' + (row.toolName || '工具')))
    if (row.reason) head.appendChild(el('span', 'approval-reason', row.reason))
    wrap.appendChild(head)
    const body = el('div', 'approval-actions')
    if (row.decided) {
      body.appendChild(el('span', 'approval-outcome', '已' + (row.outcome === 'allowed-once' ? '允许' : '拒绝')))
    } else {
      const allow = el('button', 'btn success', '允许')
      allow.addEventListener('click', () => post({ type: 'approvalRespond', sessionId: S.openId, approvalId: row.approvalId, outcome: 'allowed-once', ...(row.rpcId ? { rpcId: row.rpcId } : {}) }))
      const deny = el('button', 'btn danger', '拒绝')
      deny.addEventListener('click', () => post({ type: 'approvalRespond', sessionId: S.openId, approvalId: row.approvalId, outcome: 'rejected', ...(row.rpcId ? { rpcId: row.rpcId } : {}) }))
      body.appendChild(allow)
      body.appendChild(deny)
    }
    wrap.appendChild(body)
    return wrap
  }

  function pushSystemRow(text) {
    if (!S.open) return
    const row = { kind: 'system', text, ts: Date.now() }
    S.open.rows.push(row)
    appendRow(row)
  }

  function appendRow(row) {
    const node = renderRow(row)
    addRow(node)
  }

  // ── live streaming DOM patching ───────────────────────────────────────────
  function streamDelta(st, index, deltaText, kind) {
    const a = st.assistant
    if (!a) return
    ensureStreamDom(a)
    let node = a._streamNodes && a._streamNodes.get(index)
    if (!node) {
      const holder = el(kind === 'reasoning' ? 'details' : 'div', kind === 'reasoning' ? 'reasoning streaming' : 'md textblock streaming')
      if (kind === 'reasoning') {
        const sum = el('summary', '', '推理中…')
        holder.appendChild(sum)
        const inner = el('div', 'reasoning-content')
        holder.appendChild(inner)
        a._body.appendChild(holder)
        a._streamNodes.set(index, { kind, node: inner, summary: sum, root: holder })
      } else {
        a._body.appendChild(holder)
        a._streamNodes.set(index, { kind, node: holder, root: holder })
      }
      node = a._streamNodes.get(index)
    }
    node.node.textContent += deltaText
    if (kind === 'reasoning' && node.summary && node.summary.textContent === '推理中…') {
      node.summary.textContent = shortText(node.node.textContent)
    }
    if (S.needScroll === undefined || S.needScroll) {
      const m = $('.dsh-messages')
      m.scrollTop = m.scrollHeight
    }
  }

  function blockDone(st, index, existing) {
    const a = st.assistant
    if (!a || !existing) return
    const node = a._streamNodes && a._streamNodes.get(index)
    const text = existing.text || ''
    if (existing.type === 'reasoning') {
      if (node) {
        node.node.innerHTML = md.render(text)
        wireMd(node.node)
        node.summary.textContent = shortText(text)
        node.root.classList.add('done')
      }
      a.blocks.push({ type: 'reasoning', text, _index: index })
      if (node) a._streamNodes.delete(index)
    } else if (existing.type === 'text') {
      if (node) {
        node.root.innerHTML = md.render(text)
        wireMd(node.root)
        node.root.classList.add('done')
      }
      a.blocks.push({ type: 'text', text, _index: index })
      if (node) a._streamNodes.delete(index)
    }
  }

  function finalizeStreamingAssistant(a) {
    if (!a) return
    if (a._streamNodes) {
      for (const [index, node] of a._streamNodes) {
        if (node.kind === 'reasoning') {
          node.node.innerHTML = md.render(node.node.textContent)
          wireMd(node.node)
          node.summary.textContent = shortText(node.node.textContent)
        } else {
          node.root.innerHTML = md.render(node.node.textContent)
          wireMd(node.root)
        }
      }
      a._streamNodes.clear()
    }
  }

  function ensureStreamDom(a) {
    if (!a._body) {
      const before = a._built
      const node = renderAssistant(a)
      if (!before) {
        const m = $('.dsh-messages')
        m.appendChild(node)
      }
      a._streamNodes = new Map()
      return
    }
    if (!a._streamNodes) a._streamNodes = new Map()
  }
  // ── live frames ───────────────────────────────────────────────────────────
  function onFrame(kind, frame) {
    if (!frame || typeof frame !== 'object') return
    if (frame.type === 'session/event' && frame.sessionId === S.openId) {
      applyLive(frame.event, frame.view)
      return
    }
    if (frame.type === 'session/projection' && frame.sessionId === S.openId) applyProjection(frame)
    if (frame.type === 'approval/requested' && frame.sessionId === S.openId) applyApprovalRequest(frame)
    if (frame.type === 'approval/resolved' && frame.sessionId === S.openId) applyApprovalResolved(frame)
    if (frame.type === 'question/requested' && frame.sessionId === S.openId) applyQuestionRequest(frame)
    if (frame.type === 'session/queue' && frame.sessionId === S.openId) applyQueue(frame)
    if (frame.type === 'session/subscribed' && frame.sessionId === S.openId && S.open) {
      const asOf = frame.lastSeq
      S.open.serveAsOf = asOf
      if ((S.open.lastAppliedSeq ?? -1) < asOf - 20) {
        post({ type: 'openSession', sessionId: S.openId })
      }
    }
    if (frame.type === 'host/session-status' && frame.sessionId === S.openId) {
      if (S.open) { S.open.busy = frame.running; renderStopButton() }
    }
    if (frame.type === 'host/session-added' || frame.type === 'host/workspace-changed' || frame.type === 'host/archived-sessions-changed') {
      post({ type: 'listSessions' })
    }
    if (frame.type === 'host/session-removed') {
      S.sessions = S.sessions.filter((s) => s.sessionId !== frame.sessionId)
      renderSessionList()
    }
    if (frame.type === 'host/remote-event' && frame.event === 'agent-preset/selected') {
      const parts = frame.args || []
      if (parts[0] === S.openId) { S.open.preset = parts[1]; renderHeaderSelects() }
    }
  }

  function applyLive(ev, view) {
    const o = S.open
    if (!o) return
    S.open.lastAppliedSeq = o.lastAppliedSeq = ev.seq
    const beforeLen = o.rows.length
    foldEvent(ev, view || null, o.rows)
    for (let i = beforeLen; i < o.rows.length; i++) {
      appendRow(o.rows[i])
    }
    if (ev.type === 'turn/end') {
      renderStopButton()
      renderContextMeter()
    }
    if (ev.type === 'assistant/message' || ev.type === 'user/message' || ev.type === 'turn/start' || ev.type === 'tool/result') {
      renderStopButton()
      renderContextMeter()
    }
  }

  function applyProjection(frame) {
    const o = S.open
    if (!o) return
    if (o.projectionAsOf !== undefined && frame.seq <= (o.projectionAsOf ?? -1)) return
    o.projectionAsOf = frame.seq
    o.projections[frame.key] = frame.value
    if (frame.key === 'tokenUsage' || frame.key === 'contextPressure' || frame.key === 'contextBreakdown') renderContextMeter()
    if (frame.key === 'title' && typeof frame.value === 'string') {
      o.title = frame.value
      renderSessionList()
    }
    if (frame.key === 'imageLimits') { o.imageLimits = frame.value }
  }

  function applyApprovalRequest(frame) {
    const o = S.open
    if (!o) return
    o.pending = o.pending || new Map()
    o.pending.set(frame.approvalId, { kind: 'approval', rpcId: frame.rpcId, approvalId: frame.approvalId, toolName: frame.toolName, reason: frame.reason, sessionId: frame.sessionId })
    const row = { kind: 'approval', approvalId: frame.approvalId, toolName: frame.toolName, reason: frame.reason || '', decided: false, outcome: null, ts: Date.now(), rpcId: frame.rpcId, live: true }
    o.rows.push(row)
    appendRow(row)
  }

  function applyApprovalResolved(frame) {
    const o = S.open
    if (!o) return
    const row = o.rows.slice().reverse().find((r) => r.kind === 'approval' && r.approvalId === frame.approvalId)
    if (row) {
      row.decided = true
      row.outcome = frame.outcome
      if (row._built) {
        const fresh = renderApproval(row)
        if (row._dom && row._dom.parentNode) row._dom.parentNode.replaceChild(fresh, row._dom)
        row._dom = fresh
      }
    }
  }

  function applyQuestionRequest(frame) {
    const o = S.open
    if (!o) return
    const q = frame.questions || []
    const wrap = el('div', 'question-card')
    wrap.appendChild(el('div', 'question-head', '需要你的回答'))
    q.forEach((item) => {
      const field = el('div', 'q-item')
      field.appendChild(el('div', 'q-text', item.question || ''))
      if (item.options && item.options.length) {
        const sel = document.createElement('select')
        const opt = el('option', '', '— 请选择 —')
        opt.value = ''
        sel.appendChild(opt)
        for (const op of item.options) { const oo = el('option', '', op.label + (op.description ? ' (' + op.description + ')' : '')); oo.value = op.label; sel.appendChild(oo) }
        field.appendChild(sel)
      } else {
        const ta = el('textarea', 'q-input')
        ta.placeholder = '输入回答…'
        field.appendChild(ta)
      }
      wrap.appendChild(field)
    })
    const submit = el('button', 'btn primary', '提交回答')
    submit.addEventListener('click', () => {
      const answers = []
      const fields = wrap.querySelectorAll('.q-item')
      fields.forEach((f, i) => {
        const qq = q[i]
        if (!qq) return
        const input = f.querySelector('textarea') || f.querySelector('select')
        const val = input && input.value
        if (val !== undefined && val !== '') answers.push({ id: qq.id, selected: [val] })
      })
      post({ type: 'questionAnswer', sessionId: S.openId, rpcId: frame.rpcId, answers })
    })
    wrap.appendChild(submit)
    const m = $('.dsh-messages')
    m.appendChild(wrap)
    if (S.needScroll) m.scrollTop = m.scrollHeight
  }

  function applyQueue(frame) {
    const o = S.open
    if (!o) return
    o.queue = frame.items || []
    renderQueue()
  }

  // ── composer / prompt ─────────────────────────────────────────────────────
  function sendPrompt() {
    const input = $('.dsh-input')
    const text = input.value.trim()
    if (!text && !attachments.length) return
    if (!S.openId) return
    const content = []
    if (text) content.push({ type: 'text', text })
    for (const a of attachments) content.push(a)
    const busy = S.open && S.open.busy
    post({ type: 'prompt', sessionId: S.openId, mode: busy ? 'steer' : 'queue', content })
    input.value = ''
    input.style.height = 'auto'
    attachments.length = 0
    const tray = $('.attach-tray')
    tray.hidden = true
    clear(tray)
    if (!busy) {
      const row = { kind: 'user', parts: content.map((c) => c.type === 'text' ? { type: 'text', text: c.text } : { type: 'image', name: c.name || '图片' }), ts: Date.now() }
      S.open.rows.push(row)
      appendRow(row)
    }
  }

  function renderStopButton() {
    const stop = $('#btnStop')
    const busy = S.open && S.open.busy
    stop.hidden = !busy
    if (busy) $('.dsh-input').setAttribute('disabled', 'disabled')
    else $('.dsh-input').removeAttribute('disabled')
  }

  function renderQueue() {
    const o = S.open
    const box = $('#dsh-queue')
    if (!box) return
    if (!o || !o.queue || !o.queue.length) { box.hidden = true; return }
    box.hidden = false
    clear(box)
    for (const item of o.queue) {
      const chip = el('div', 'queue-chip')
      const tag = el('span', 'queue-tag', item.placement === 'steer' ? '插入' : item.placement === 'context' ? '上下文' : '排队')
      chip.appendChild(tag)
      const txt = textOfMessage(item.message)
      chip.appendChild(el('span', 'queue-text', txt.length > 60 ? txt.slice(0, 60) + '…' : txt))
      box.appendChild(chip)
    }
  }
  function textOfMessage(message) {
    return (message && (message.text || (message.content || []).map((b) => b.text || '').join(' '))) || ''
  }

  // ── context meter (D1: 服务端 projections 优先,无则估算) ───────────────────
  function renderContextMeter() {
    const o = S.open
    const meter = $('.context-meter')
    if (!meter || !o) return
    const p = o.projections || {}
    const pressure = p.contextPressure || {}
    let tokens = pressure.pressureTokens
    let window = pressure.contextWindow || o.contextWindow
    let estimated = false
    if ((tokens === undefined || window === undefined) && p.tokenUsage) {
      const u = p.tokenUsage
      tokens = (u.uncachedInputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadTokens || 0)
      estimated = !pressure.contextWindow
    }
    const fill = meter.querySelector('.cm-fill')
    const label = meter.querySelector('.cm-label')
    if (tokens === undefined || !window) {
      fill.style.width = '0%'
      fill.className = 'cm-fill'
      label.textContent = '上下文 –'
      return
    }
    const pct = Math.min(100, (tokens / window) * 100)
    fill.style.width = pct.toFixed(1) + '%'
    fill.className = 'cm-fill ' + (pct > 90 ? 'critical' : pct > 70 ? 'warning' : '')
    label.textContent = fmtNum(tokens) + ' / ' + fmtNum(window) + ' (' + pct.toFixed(0) + '%)' + (estimated ? ' ·估算' : '')
    meter.title = (estimated ? '估算值' : '服务端 token 计量') + ' — >70% 黄色预警, >90% 红色建议压缩'
    const btn = $('#btnCompact')
    btn.classList.toggle('urgent', pct > 90)
  }

  // ── header selects (模型/推理档/预设) ─────────────────────────────────────
  function renderHeaderSelects() {
    const model = $('#modelSel')
    const effort = $('#effortSel')
    const preset = $('#presetSel')
    const o = S.open
    if (!o) {
      model.innerHTML = ''
      effort.innerHTML = ''
      preset.innerHTML = ''
      return
    }
    clear(preset)
    const defOpt = el('option', '', o.blank ? '新建会话选择预设…' : '预设:' + (o.preset || '—'))
    defOpt.value = ''
    preset.appendChild(defOpt)
    for (const p of (o.presets.presets || [])) {
      const opt = el('option', '', (p.name || p.id) + (p.isDefault ? '(默认)' : ''))
      opt.value = p.id
      preset.appendChild(opt)
    }
    preset.disabled = !o.blank
    if (!o.blank) preset.title = '会话已开始,预设已固定(仅空白会话可切换)'
    if (o.preset) preset.value = o.preset
    clear(model)
    const list = o.modelList || []
    if (!list.length) {
      model.appendChild(el('option', '', '模型列表不可用'))
      model.disabled = true
    } else {
      model.disabled = false
      let selIdx = 0
      list.forEach((m, i) => {
        const opt = el('option', '', m.name)
        opt.value = String(i)
        model.appendChild(opt)
        if (o.models && o.models.current && o.models.current.provider === m.provider && o.models.current.model === m.model) selIdx = i
      })
      model.value = String(selIdx)
    }
    clear(effort)
    const cur = currentModel()
    const m = cur && list.find((x) => x.provider === cur.provider && x.model === cur.model)
    const efforts = (m && m.reasoning && m.reasoning.efforts) || []
    if (!efforts.length) {
      effort.appendChild(el('option', '', '推理档位–'))
      effort.disabled = true
    } else {
      effort.disabled = false
      for (const e of efforts) {
        const opt = el('option', '', e.name || e.id)
        opt.value = e.id
        effort.appendChild(opt)
      }
      if (cur && cur.reasoningEffort) effort.value = cur.reasoningEffort
    }
    renderContextMeter()
  }

  // ── banner / empty / settings / timeline ──────────────────────────────────
  function renderBanner() {
    const banner = $('.dsh-banner')
    if (!banner) return
    const disconnected = S.conn !== 'connected'
    const serverDown = S.server.state === 'idle' || S.server.state === 'error' || S.server.state === 'starting'
    if (!disconnected && !serverDown) { banner.hidden = true; return }
    banner.hidden = false
    clear(banner)
    if (disconnected) {
      banner.appendChild(el('span', 'banner-text', '连接已断开,自动重连中…'))
      const retry = el('button', 'btn', '重试')
      retry.addEventListener('click', () => post({ type: 'boot' }))
      banner.appendChild(retry)
      return
    }
    banner.appendChild(el('span', 'banner-text', 'dsh 服务未运行(' + S.server.label + ')' + (S.server.error ? ': ' + S.server.error : '')))
    const open = el('button', 'btn', '打开浏览器')
    open.addEventListener('click', () => post({ type: 'openBrowser' }))
    banner.appendChild(open)
    const restart = el('button', 'btn', '重启服务')
    restart.addEventListener('click', () => post({ type: 'restartServer' }))
    banner.appendChild(restart)
  }

  function renderEmpty() {
    const empty = $('.dsh-empty')
    if (!empty) return
    if (S.openId) { empty.hidden = true; return }
    empty.hidden = false
    clear(empty)
    const logo = el('div', 'empty-logo', 'DSH')
    empty.appendChild(logo)
    empty.appendChild(el('div', 'empty-title', S.wsPath ? '当前工作区' : '未打开工作区'))
    empty.appendChild(el('div', 'empty-line', S.conn !== 'connected' ? '等待连接 dsh 服务…' : '选择一个会话,或开始新的会话'))
    const btn = el('button', 'btn primary', '新会话')
    btn.addEventListener('click', () => post({ type: 'createSession', cwd: S.wsPath }))
    empty.appendChild(btn)
  }

  function renderAll() {
    const o = S.open
    const msg = $('.dsh-messages')
    clear(msg)
    if (o && o.skipped > 0) {
      const note = el('div', 'msg system large-note', '已折叠较早的 ' + o.skipped + ' 条事件(大会话防卡)')
      msg.appendChild(note)
    }
    if (!o || !o.rows.length) {
      renderEmpty()
    } else {
      msg.hidden = false
      for (const row of o.rows) msg.appendChild(renderRow(row))
      if (S.needScroll) msg.scrollTop = msg.scrollHeight
    }
    renderHeaderSelects()
    renderStopButton()
    renderQueue()
    renderContextMeter()
    renderBanner()
    renderSessionList()
  }

  function prependHistory(m) {
    const o = S.open
    if (!o || m.sessionId !== o.id) return
    const rows = []
    const saved = o.rows
    o.rows = []
    for (const entry of m.events || []) {
      foldEvent(entry.event, entry.view, o.rows)
    }
    o.stream = null
    const newRows = o.rows
    o.rows = saved
    o.hasMore = m.hasMore
    const msg = $('.dsh-messages')
    if (m.hasMore) {
      const more = el('button', 'btn load-more', '加载更早消息')
      more.addEventListener('click', () => {
        const first = o.rows.find((r) => r._seq)
        post({ type: 'historyMore', sessionId: o.id, beforeSeq: (first && first._seq) || m.seq })
      })
      msg.insertBefore(more, msg.firstChild)
    }
    for (let i = newRows.length - 1; i >= 0; i--) {
      const node = renderRow(newRows[i])
      msg.insertBefore(node, msg.firstChild)
    }
    o.rows = newRows.concat(o.rows)
  }

  function renderTimelinePanel() {
    const o = S.open
    const banner = $('.dsh-banner')
    if (!banner) return
    if (!S.timelineOpen) { renderBanner(); return }
    banner.hidden = false
    clear(banner)
    const head = el('span', 'banner-text', '时间线(' + ((o && o.timeline.length) || 0) + ' 事件)')
    banner.appendChild(head)
    const closeBtn = el('button', 'btn', '关闭')
    closeBtn.addEventListener('click', () => { S.timelineOpen = false; renderBanner() })
    banner.appendChild(closeBtn)
    banner.title = (o ? o.timeline.slice(-40).map((t) => fmtTime(t.time) + ' ' + t.type).join('\\n') : '')
  }

  function renderSettings() {
    const aside = $('.dsh-settings')
    if (!aside) return
    aside.hidden = !S.settingsOpen
    if (!S.settingsOpen) return
    clear(aside)
    const h = el('div', 'settings-head', '设置')
    aside.appendChild(h)
    const close = el('button', 'iconbtn', '×')
    close.addEventListener('click', () => { S.settingsOpen = false; renderSettings() })
    h.appendChild(close)
    const c = S.config || {}
    const d = S.describe || {}
    const rows = [
      ['服务地址', 'http://127.0.0.1:' + (c.port ?? 3080)],
      ['端口', String(c.port ?? '–')],
      ['服务版本', d.version || '–'],
      ['主机目录(cwd)', d.cwd || '–'],
      ['当前模型', (d.provider || '') + ' / ' + (d.model || '–')],
      ['DSH_HOME', S.dshHome || '–'],
      ['attachExisting', String(c.attachExisting)],
      ['spawnIfMissing', String(c.spawnIfMissing)],
      ['followWorkspace', String(c.followWorkspace)],
      ['stopOnExit', String(c.stopOnExit)],
      ['autoOpen(展开侧边栏)', String(c.autoOpen)],
    ]
    for (const [k, v] of rows) {
      const line = el('div', 'set-row')
      line.appendChild(el('span', 'set-key', k))
      line.appendChild(el('span', 'set-val', v))
      aside.appendChild(line)
    }
    const btns = el('div', 'set-actions')
    const open = el('button', 'btn', '在浏览器中打开')
    open.addEventListener('click', () => post({ type: 'openBrowser' }))
    const reload = el('button', 'btn', '重载侧边栏')
    reload.addEventListener('click', () => post({ type: 'reload' }))
    const restart = el('button', 'btn', '重启服务(仅自启实例)')
    restart.addEventListener('click', () => post({ type: 'restartServer' }))
    btns.appendChild(open)
    btns.appendChild(reload)
    btns.appendChild(restart)
    aside.appendChild(btns)
  }

  function wireMd(root) {
    if (!root) return
    root.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.copybtn')
      if (!btn) return
      const pre = btn.closest('.codeblock')
      if (pre) {
        const code = pre.querySelector('code')
        post({ type: 'copyText', text: code ? code.textContent : '' })
        btn.textContent = '已复制'
        setTimeout(() => { btn.textContent = '复制' }, 1200)
      }
    })
    const links = root.querySelectorAll && root.querySelectorAll('a')
    if (links) for (const a of links) a.addEventListener('click', (e) => {
      e.preventDefault()
      if (a.href) post({ type: 'openUrl', url: a.href })
    })
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  function boot() {
    bootSkeleton()
    post({ type: 'boot' })
    post({ type: 'listSessions' })
    post({ type: 'lastSession' })
  }
  boot()
})()
