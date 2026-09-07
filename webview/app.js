'use strict'
// DSH native sidebar front-end (Claude Code style, 100% VS Code theme vars).
// Talks to the extension host via postMessage; all server I/O goes through
// the host (path B: webview 鈫?extension.js 鈫?dsh service on 3080).
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
    perm: 'auto',
    pill: {},
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
    if (n === undefined || n === null) return '鈥?
    if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k'
    return String(n)
  }

  // 鈹€鈹€ DOM helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    // Claude Code 椋庢牸甯冨眬:椤堕儴缁嗘潯 + 娑堟伅鍖?+ 搴曢儴鍦嗚杈撳叆 + 鑽父閫夋嫨鍣?    root.innerHTML =
      '<header class="dsh-header">' +
      '  <div class="brand" title="DeepSeek Harness">&#10035; DSH <span class="brand-ver">f8</span></div>' +
      '  <div class="hdr-actions">' +
      '    <button class="iconbtn" id="btnSessions" title="浼氳瘽鍒楄〃">&#9776;</button>' +
      '    <button class="iconbtn" id="btnNewSession" title="鏂颁細璇?>&#10010;</button>' +
      '    <button class="iconbtn" id="btnSettings" title="璁剧疆">&#9881;</button>' +
      '    <button class="iconbtn" id="btnCollapse" title="鏀惰捣闈㈡澘">&#187;</button>' +
      '  </div>' +
      '</header>' +
      '<section class="dsh-sessionbar" hidden>' +
      '  <div class="sb-head"><span class="sb-title">浼氳瘽</span><span class="sb-count"></span><button class="sb-toggle" title="灞曞紑/鎶樺彔浼氳瘽鍒楄〃">&#9662;</button></div>' +
      '  <div class="sb-list"></div>' +
      '</section>' +
      '<main class="dsh-main">' +
      '  <div class="dsh-banner" hidden></div>' +
      '  <div class="dsh-messages"></div>' +
      '  <div class="dsh-empty" hidden></div>' +
      '  <div class="dsh-composer">' +
      '    <div class="composer-card">' +
      '      <div class="attach-tray" hidden></div>' +
      '      <textarea class="dsh-input" rows="1" placeholder="杈撳叆娑堟伅,Enter 鍙戦€?Shift+Enter 鎹㈣"></textarea>' +
      '      <div class="composer-row">' +
      '        <div class="cc-left">' +
      '          <div class="hdr-selects">' +
      '            <button class="hdr-sel pill" id="permPill" title="鏉冮檺妯″紡"></button>' +
      '            <button class="hdr-sel pill" id="modelPill" title="妯″瀷"></button>' +
      '            <button class="hdr-sel pill" id="effortPill" title="鎺ㄧ悊妗ｄ綅"></button>' +
      '            <button class="hdr-sel pill" id="presetPill" title="棰勮(浠呯┖鐧戒細璇濆彲鍒囨崲)"></button>' +
      '          </div>' +
      '          <button class="iconbtn compact-btn" id="btnCompact" title="鍘嬬缉浼氳瘽">鍘嬬缉</button>' +
      '        </div>' +
      '        <div class="cc-right">' +
      '          <div class="context-meter">' +
      '            <button class="cm-ring" id="cmRing" title="涓婁笅鏂囧崰鐢?><svg viewBox="0 0 14 14" width="15" height="15"><circle class="cm-track" cx="7" cy="7" r="5.5"/><circle class="cm-arc" cx="7" cy="7" r="5.5" transform="rotate(-90 7 7)"/></svg></button>' +
      '            <div class="cm-panel" hidden></div>' +
      '          </div>' +
      '          <button class="sendbtn" id="btnSend" title="鍙戦€?>&#8593;</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</main>' +
      '<aside class="dsh-settings" hidden></aside>'
    app.appendChild(root)
    const sbToggle = $('.sb-toggle')
    if (sbToggle) sbToggle.addEventListener('click', () => { $('.dsh-sessionbar').hidden = true })
    bindHeader()
    bindComposer()
  }

  // 鈹€鈹€ harness 椋庢牸鑽父鑿滃崟(鏇夸唬鍘熺敓 select 涓嬫媺) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  let menuEl = null
  function closePillMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null }
  }
  function pillMenu(anchor, items, onPick) {
    closePillMenu()
    const menu = el('div', 'pill-menu')
    for (const it of items) {
      const row = el('button', 'pill-item' + (it.checked ? ' checked' : ''))
      row.appendChild(el('span', 'pill-check', it.checked ? '鉁? : ''))
      row.appendChild(el('span', 'pill-label', it.label))
      row.appendChild(el('span', 'pill-meta', it.meta || ''))
      row.addEventListener('click', () => {
        closePillMenu()
        if (it.value !== undefined) onPick(it.value, it)
      })
      menu.appendChild(row)
    }
    document.body.appendChild(menu)
    const r = anchor.getBoundingClientRect()
    menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 200)) + 'px'
    menu.style.top = Math.min(r.bottom + 3, window.innerHeight - menu.scrollHeight - 8) + 'px'
    menuEl = menu
    const close = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        closePillMenu()
        document.removeEventListener('pointerdown', close)
      }
    }
    setTimeout(() => document.addEventListener('pointerdown', close), 0)
    return menu
  }
  function permLabel() { return S.perm === 'plan' ? '鏉冮檺:璁″垝妯″紡' : '鏉冮檺:鑷姩' }

  function bindHeader() {
    $('#btnSessions').addEventListener('click', () => { $('.dsh-sessionbar').hidden = !$('.dsh-sessionbar').hidden })
    $('#btnNewSession').addEventListener('click', () => post({ type: 'createSession', cwd: S.wsPath }))
    $('#btnSettings').addEventListener('click', () => { S.settingsOpen = !S.settingsOpen; renderSettings() })
    $('#btnCollapse').addEventListener('click', () => post({ type: 'collapse' }))
    $('#permPill').addEventListener('click', (e) => {
      pillMenu(e.currentTarget, [
        { label: '鑷姩', meta: '鎸夐璁惧喅瀹?鍗遍櫓鎿嶄綔闇€纭', value: 'auto', checked: S.perm === 'auto' },
        { label: '璁″垝妯″紡', meta: '鍏堝嚭璁″垝,纭鍚庢墠鍔ㄦ墜(/plan)', value: 'plan', checked: S.perm === 'plan' },
      ], (v) => {
        S.perm = v
        if (S.openId) {
          const text = v === 'plan' ? '/plan' : '/plan off'
          post({ type: 'prompt', sessionId: S.openId, mode: 'queue', content: [{ type: 'text', text }] })
        }
        renderHeaderSelects()
      })
    })
    $('#modelPill').addEventListener('click', (e) => {
      const o = S.open
      if (!o || !S.openId) return
      const list = o.modelList || []
      const cur = currentModel()
      pillMenu(e.currentTarget, list.map((m, i) => ({
        label: m.name,
        meta: m.provider,
        value: i,
        checked: cur && cur.provider === m.provider && cur.model === m.model,
      })), (i) => {
        const m = list[i]
        if (!m) return
        post({ type: 'selectModel', sessionId: S.openId, provider: m.provider, model: m.model, reasoningEffort: m.reasoningEffort })
      })
    })
    $('#effortPill').addEventListener('click', (e) => {
      const o = S.open
      const m = currentModel()
      if (!o || !S.openId || !m) return
      const efforts = (m.reasoning && m.reasoning.efforts) || []
      if (!efforts.length) return
      pillMenu(e.currentTarget, efforts.map((ef) => ({
        label: ef.name || ef.id,
        value: ef.id,
        checked: m.reasoningEffort === ef.id,
      })), (v) => {
        post({ type: 'selectModel', sessionId: S.openId, provider: m.provider, model: m.model, reasoningEffort: v })
      })
    })
    $('#presetPill').addEventListener('click', (e) => {
      const o = S.open
      if (!o || !S.openId || !o.blank) return
      const presets = (o.presets.presets || [])
      pillMenu(e.currentTarget, presets.map((p) => ({
        label: p.name || p.id,
        meta: p.isDefault ? '榛樿' : '',
        value: p.id,
        checked: o.preset === p.id,
      })), (v) => {
        post({ type: 'selectPreset', sessionId: S.openId, agentPreset: v })
      })
    })
    const cmRing = $('#cmRing')
    if (cmRing) {
      cmRing.addEventListener('click', (e) => {
        e.stopPropagation()
        const panel = $('.cm-panel')
        if (!panel) return
        panel.hidden = !panel.hidden
      })
      document.addEventListener('pointerdown', (e) => {
        const meter = $('.context-meter')
        const panel = $('.cm-panel')
        if (meter && panel && !panel.hidden && !meter.contains(e.target)) panel.hidden = true
      })
    }
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
    $('#btnSend').addEventListener('click', () => {
      // 杩愯涓偣鍑?= 鍋滄;绌洪棽鏃剁偣鍑?= 鍙戦€?harness 鍚屾鍗曟寜閽?
      if (S.open && S.open.busy) post({ type: 'cancel', sessionId: S.openId })
      else sendPrompt()
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
    const x = el('button', 'chip-x', '脳')
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

  // 鈹€鈹€ host messages 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  window.addEventListener('message', (e) => handle(e.data || {}))

  function handle(m) {
    switch (m.type) {
      case 'hello':
        S.conn = 'connecting'
        S.bootTries = (S.bootTries || 0) + 1
        // 鎻℃墜鑷剤:VS Code 鍙兘涓㈠純 webview 灏辩华鍓嶆帹閫佺殑娑堟伅,鏀朵笉鍒板垯閲嶈瘯
        scheduleWatchdog()
        break
      case 'workspace':
        S.wsPath = m.path
        break
      case 'describe':
        S.describe = m.describe
        S.config = m.config
        // 鏈嶅姟鑳藉洖 describe 鍗宠鏄庡湪杩愯,淇鍙兘閿欒繃鐨?serverState 鎺ㄩ€?        if (!S.server.state || S.server.state === 'idle') S.server.state = 'attached'
        renderEmpty()
        renderBanner()
        break
      case 'connection':
        S.conn = m.state
        renderBanner()
        // 杩炴帴灏辩华鍚庨噸鏂版媺浼氳瘽鍒楄〃(淇鏃跺簭绔炴€?
        if (m.state === 'connected') post({ type: 'listSessions' })
        break
      case 'serverState':
        S.server = { state: m.state, label: m.label, error: m.error || '' }
        renderBanner()
        break
      case 'sessionList':
        S.sessions = m.items || []
        S.archived = new Set(m.archivedIds || [])
        if (m.workspacePath) S.wsPath = m.workspacePath
        renderSessionList()
        // A2: 璁颁綇涓婃浼氳瘽,鑷姩鎭㈠
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
        pushSystemRow('宸插仠姝?)
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
        pushSystemRow('宸查噸鍛藉悕涓恒€? + m.title + '銆?)
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
        pushSystemRow('閿欒: ' + m.message)
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
  // 鈹€鈹€ session list (A5 浠呭綋鍓嶅伐浣滃尯 + A3 鏈€杩戞椿鍔ㄩ檷搴? 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function workspaceSessions() {
    const pathNorm = (p) => p ? String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : p
    const ws = pathNorm(S.wsPath)
    let items = S.sessions.filter((s) => !S.archived.has(s.sessionId))
    if (!S.showAllSessions && ws && S.wsPath) items = items.filter((s) => pathNorm(s.cwd) === ws)
    items = items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return items
  }

  function renderSessionList() {
    const list = $('.sb-list')
    clear(list)
    const items = workspaceSessions()
    $('.sb-count').textContent = String(items.length)
    if (!items.length) {
      const none = el('div', 'sb-empty')
      none.appendChild(el('span', '', S.sessions.length && S.wsPath && !S.showAllSessions ? '鏈伐浣滃尯鏆傛棤浼氳瘽(鍏朵粬宸ヤ綔鍖哄叡 ' + S.sessions.length + ' 涓?' : S.wsPath ? '鏈伐浣滃尯杩樻病鏈変細璇? : '娌℃湁浼氳瘽(鏈墦寮€宸ヤ綔鍖?'))
      if (S.sessions.length && S.wsPath && !S.showAllSessions) {
        const showAll = el('button', 'act-btn', '鏄剧ず鍏ㄩ儴')
        showAll.addEventListener('click', () => { S.showAllSessions = true; renderSessionList() })
        none.appendChild(showAll)
      }
      list.appendChild(none)
      return
    }
    for (const it of items) {
      const row = el('div', 'sb-row' + (it.sessionId === S.openId ? ' active' : ''))
      row.title = (it.cwd || '') + ' 路 ' + it.sessionId
      const projTitle = it.projections && it.projections.values && it.projections.values.title
      const title = it.sessionId === S.openId && S.open && S.open.title ? S.open.title : (projTitle || it.title || it.name)
      const head = el('div', 'sb-titleline')
      const name = el('span', 'sb-name', title || '鏂颁細璇? + (it.blank ? '' : ' (鏃犳爣棰?'))
      head.appendChild(name)
      if (it.running) head.appendChild(el('span', 'sb-dot running', '杩愯涓?))
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
    mk('閲嶅懡鍚?, () => {
      const t = prompt('鏂版爣棰?, it.title || '')
      if (t !== null) post({ type: 'renameSession', sessionId: it.sessionId, title: t })
    })
    mk('褰掓。', () => post({ type: 'archiveSession', sessionId: it.sessionId }))
    mk('娲剧敓鏂颁細璇?fork)', () => post({ type: 'forkSession', sessionId: it.sessionId }))
    if (it.running) mk('鍋滄', () => post({ type: 'cancel', sessionId: it.sessionId }))
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

  // 鈹€鈹€ open session 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    // 鍘嗗彶鎶樺彔鍙兘钀藉湪 turn/start 涔嬪悗(turn/end 琚埅鏂?鈥斺€斾笉瑕佸洜姝ゅ崱浜仠姝㈡寜閽?
    // 鑻ヤ細璇濈‘瀹炲湪璺?鍚庣画 live 甯т細閲嶆柊缃綅 busy銆?    S.open.busy = false
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
      if (typeof entry.seq === 'number' && entry.seq > (S.open.lastAppliedSeq ?? -1)) S.open.lastAppliedSeq = entry.seq
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
        const parts = partsOf(d.message && d.message.content)
        if (!parts.length) break // 绌哄唴瀹瑰抚涓嶆覆鏌?鏈嶅姟绔彲鑳藉洖鏀剧┖甯?
        const row = { kind: 'user', parts, ts: ev.time }
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
        rows.push({ kind: 'system', text: '宸插帇缂? ' + String(d.summary || d.text || '浼氳瘽鍘嗗彶宸插帇缂?), ts: ev.time })
        break
      case 'compaction/prune':
        rows.push({ kind: 'system', text: '宸蹭慨鍓伐鍏风粨鏋?' + (d.shadowedToolResults ?? d.items ?? '?') + ')', ts: ev.time })
        break
      case 'compaction/start':
        rows.push({ kind: 'system', text: '寮€濮嬪帇缂╀細璇濃€?, ts: ev.time })
        break
      case 'session/title':
        if (S.open) { S.open.title = d.title || null }
        break
      case 'plan/mode':
        rows.push({ kind: 'system', text: '璁″垝妯″紡: ' + (d.active ? '宸插紑鍚? : '宸插叧闂?), ts: ev.time })
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
    return (content || []).flatMap((b) => b.type === 'text' ? [{ type: 'text', text: b.text }] : b.type === 'image' ? [{ type: 'image', name: b.name || '鍥剧墖', hasData: false }] : [])
  }
  function resultTextOf(content) {
    const txt = contentTextOf(content)
    return txt.length > 300 ? txt.slice(0, 300) + '鈥? : txt
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
    return t.length > 160 ? t.slice(0, 160) + '鈥? : t
  }
  // 鈹€鈹€ row rendering (live + history, theme-variable based) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function renderRow(row) {
    let node = null
    switch (row.kind) {
      case 'user': {
        const wrap = el('div', 'msg user')
        const meta = el('div', 'msg-meta', '浣?)
        wrap.appendChild(meta)
        const body = el('div', 'msg-body')
        for (const p of row.parts || []) {
          if (p.type === 'text' && p.text) {
            const d = el('div', 'md', '')
            d.innerHTML = md.render(p.text)
            wireMd(d)
            body.appendChild(d)
          }
          if (p.type === 'image') body.appendChild(el('div', 'img-chip', '馃摲 ' + (p.name || '鍥剧墖')))
        }
        wrap.appendChild(body)
        // 閲嶆柊鍙戦€?棰勫～缂栬緫鍣ㄧ紪杈戝悗鍙戦€?闇€姹?v0.2-18 杞婚噺瀹炵幇)
        const act = el('div', 'msg-actions')
        const resend = el('button', 'act-btn', '閲嶆柊鍙戦€?)
        resend.title = '灏嗚繖鏉℃秷鎭～鍏ヨ緭鍏ユ,缂栬緫鍚庢寜 Enter 閲嶅彂'
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
    const copy = el('button', 'act-btn', '澶嶅埗')
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
        const sum = el('summary', '', shortText(b.text || '鎺ㄧ悊杩囩▼'))
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
    return s.length > 90 ? s.slice(0, 90) + '鈥? : s
  }

  function renderTool(row) {
    const wrap = el('div', 'tool-card' + (row.status === 'running' ? ' running' : row.status === 'err' ? ' err' : ''))
    const head = el('div', 'tool-head')
    const icon = el('span', 'tool-icon', row.status === 'running' ? '鉄? : row.status === 'err' ? '鉁? : '鉁?)
    head.appendChild(icon)
    head.appendChild(el('span', 'tool-name', row.name || (row.view && row.view.title) || '宸ュ叿'))
    if (row.view && row.view.kind) head.appendChild(el('span', 'tool-kind', String(row.view.kind)))
    if (row.status === 'running') head.appendChild(el('span', 'tool-spin', '杩愯涓€?))
    const toggle = el('button', 'tool-toggle', '璇︽儏')
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
      const icon = el('span', 'disp-icon', entry.isError ? '鉁? : '路')
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
      const pre = el('pre', 'result-text', row.resultText.length > 1200 ? row.resultText.slice(0, 1200) + '\\n鈥? : row.resultText)
      d.res.appendChild(pre)
    } else {
      d.res.textContent = ''
      if (row.status === 'running') d.res.textContent = 'tool result 灏氭湭杩斿洖鈥?
    }
  }

  function renderTodo(row) {
    const wrap = el('div', 'todo-card')
    const head = el('div', 'todo-head', '浠诲姟娓呭崟')
    wrap.appendChild(head)
    const list = el('div', 'todo-items')
    for (const it of row.items || []) {
      const line = el('div', 'todo-item ' + (it.status || ''))
      const mark = el('span', 'todo-mark', it.status === 'completed' || it.status === 'done' ? '鉁? : '鈼?)
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
    head.appendChild(el('span', 'approval-icon', '鈿?))
    head.appendChild(el('span', 'approval-title', '鏉冮檺璇锋眰: ' + (row.toolName || '宸ュ叿')))
    if (row.reason) head.appendChild(el('span', 'approval-reason', row.reason))
    wrap.appendChild(head)
    const body = el('div', 'approval-actions')
    if (row.decided) {
      body.appendChild(el('span', 'approval-outcome', '宸? + (row.outcome === 'allowed-once' ? '鍏佽' : '鎷掔粷')))
    } else {
      const allow = el('button', 'btn success', '鍏佽')
      allow.addEventListener('click', () => post({ type: 'approvalRespond', sessionId: S.openId, approvalId: row.approvalId, outcome: 'allowed-once', ...(row.rpcId ? { rpcId: row.rpcId } : {}) }))
      const deny = el('button', 'btn danger', '鎷掔粷')
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

  // 鈹€鈹€ live streaming DOM patching 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function streamDelta(st, index, deltaText, kind) {
    const a = st.assistant
    if (!a) return
    ensureStreamDom(a)
    let node = a._streamNodes && a._streamNodes.get(index)
    if (!node) {
      const holder = el(kind === 'reasoning' ? 'details' : 'div', kind === 'reasoning' ? 'reasoning streaming' : 'md textblock streaming')
      if (kind === 'reasoning') {
        const sum = el('summary', '', '鎺ㄧ悊涓€?)
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
    if (kind === 'reasoning' && node.summary && node.summary.textContent === '鎺ㄧ悊涓€?) {
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
  // 鈹€鈹€ live frames 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
      if (S.open) { S.open.busy = frame.running; renderSendState() }
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
    // 鎸?seq 鍘婚噸:鍘嗗彶宸叉姌鍙犳垨宸插鐞嗚繃鐨勪簨浠朵笉鍐嶉噸澶嶅簲鐢?鍚﹀垯姣忔潯娑堟伅鍑虹幇澶氭潯閲嶅/绌鸿)
    if (typeof ev.seq === 'number' && ev.seq <= (o.lastAppliedSeq ?? -1)) return
    S.open.lastAppliedSeq = o.lastAppliedSeq = ev.seq
    const beforeLen = o.rows.length
    foldEvent(ev, view || null, o.rows)
    for (let i = beforeLen; i < o.rows.length; i++) {
      appendRow(o.rows[i])
    }
    if (ev.type === 'turn/end') {
      renderSendState()
      renderContextMeter()
    }
    if (ev.type === 'assistant/message' || ev.type === 'user/message' || ev.type === 'turn/start' || ev.type === 'tool/result') {
      renderSendState()
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
    wrap.appendChild(el('div', 'question-head', '闇€瑕佷綘鐨勫洖绛?))
    q.forEach((item) => {
      const field = el('div', 'q-item')
      field.appendChild(el('div', 'q-text', item.question || ''))
      if (item.options && item.options.length) {
        const sel = document.createElement('select')
        const opt = el('option', '', '鈥?璇烽€夋嫨 鈥?)
        opt.value = ''
        sel.appendChild(opt)
        for (const op of item.options) { const oo = el('option', '', op.label + (op.description ? ' (' + op.description + ')' : '')); oo.value = op.label; sel.appendChild(oo) }
        field.appendChild(sel)
      } else {
        const ta = el('textarea', 'q-input')
        ta.placeholder = '杈撳叆鍥炵瓟鈥?
        field.appendChild(ta)
      }
      wrap.appendChild(field)
    })
    const submit = el('button', 'btn primary', '鎻愪氦鍥炵瓟')
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

  // 鈹€鈹€ composer / prompt 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    // 涓嶅仛涔愯鍥炴樉:鏉冨▉ user/message 浜嬩欢缁?mux 娴佸埌杈惧悗娓叉煋(宸叉寜 seq 鍘婚噸,閬垮厤閲嶅/绌烘皵娉?
  }

  function renderSendState() {
    const send = $('#btnSend')
    if (!send) return
    const busy = S.open && S.open.busy
    send.classList.toggle('stop', !!busy)
    send.innerHTML = busy ? '&#9632;' : '&#8593;'
    send.title = busy ? '鍋滄' : '鍙戦€?
    const input = $('.dsh-input')
    if (input) {
      if (busy) input.setAttribute('placeholder', '杩愯涓?Enter 鎻掑叆瀵硅瘽,鐐瑰嚮 鈻?鍋滄')
      else input.setAttribute('placeholder', '杈撳叆娑堟伅,Enter 鍙戦€?Shift+Enter 鎹㈣')
    }
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
      const tag = el('span', 'queue-tag', item.placement === 'steer' ? '鎻掑叆' : item.placement === 'context' ? '涓婁笅鏂? : '鎺掗槦')
      chip.appendChild(tag)
      const txt = textOfMessage(item.message)
      chip.appendChild(el('span', 'queue-text', txt.length > 60 ? txt.slice(0, 60) + '鈥? : txt))
      box.appendChild(chip)
    }
  }
  function textOfMessage(message) {
    return (message && (message.text || (message.content || []).map((b) => b.text || '').join(' '))) || ''
  }

  // 鈹€鈹€ context meter (D1: 鏈嶅姟绔?projections 浼樺厛,鏃犲垯浼扮畻) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function fmtTokens(n) {
    if (n === undefined || n === null) return '鈥?
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    return String(n)
  }

  function renderContextMeter() {
    const o = S.open
    const meter = $('.context-meter')
    if (!meter) return
    const arc = meter.querySelector('.cm-arc')
    const panel = meter.querySelector('.cm-panel')
    if (!arc || !panel) return
    if (!o) {
      arc.setAttribute('stroke-dasharray', '0 100')
      arc.classList.remove('warning', 'critical')
      meter.title = '涓婁笅鏂囩敤閲?鎵撳紑浼氳瘽鍚庢樉绀?'
      if (!panel.hidden) panel.hidden = true
      return
    }
    const p = o.projections || {}
    const pressure = p.contextPressure || {}
    const breakdown = p.contextBreakdown || null
    let tokens = pressure.pressureTokens
    let window = pressure.contextWindow || o.contextWindow
    if ((tokens === undefined || window === undefined) && p.tokenUsage) {
      const u = p.tokenUsage
      tokens = (u.uncachedInputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadTokens || 0)
    }
    if (tokens === undefined || !window) {
      arc.setAttribute('stroke-dasharray', '0 100')
      arc.classList.remove('warning', 'critical')
      meter.title = '涓婁笅鏂囩敤閲?
      return
    }
    const pct = Math.min(100, (tokens / window) * 100)
    const CIRC = 2 * Math.PI * 5.5
    arc.setAttribute('stroke-dasharray', (CIRC * pct / 100).toFixed(2) + ' ' + CIRC.toFixed(2))
    arc.classList.toggle('warning', pct > 70 && pct <= 90)
    arc.classList.toggle('critical', pct > 90)
    meter.title = '涓婁笅鏂囧凡鐢?' + pct.toFixed(0) + '%(~' + fmtTokens(tokens) + ' / ' + fmtTokens(window) + ')'
    const btn = $('#btnCompact')
    if (btn) btn.classList.toggle('urgent', pct > 90)
    // harness 鍚屾灞曞紑闈㈡澘:鐧惧垎姣?+ 鏁板瓧 + 涓夋鎷嗗垎(绯荤粺/宸ュ叿/娑堟伅)
    clear(panel)
    const head = el('div', 'cmp-head')
    head.appendChild(el('span', 'cmp-percent', pct.toFixed(0) + '%'))
    head.appendChild(el('span', 'cmp-figures', '~' + fmtTokens(tokens) + ' / ' + fmtTokens(window)))
    panel.appendChild(head)
    const bar = el('div', 'cmp-bar')
    const rows = [
      { key: 'systemTokens', label: '绯荤粺', cls: 'cmp-system' },
      { key: 'toolsTokens', label: '宸ュ叿', cls: 'cmp-tools' },
      { key: 'messageTokens', label: '娑堟伅', cls: 'cmp-messages' },
    ]
    const bTotal = breakdown ? (breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens) : 0
    if (breakdown && bTotal > 0) {
      for (const r of rows) {
        const w = pct * (breakdown[r.key] || 0) / bTotal
        if (w > 0) {
          const seg = el('div', 'cmp-seg ' + r.cls)
          seg.style.width = w.toFixed(1) + '%'
          bar.appendChild(seg)
        }
      }
    } else {
      const seg = el('div', 'cmp-seg cmp-system')
      seg.style.width = pct.toFixed(1) + '%'
      bar.appendChild(seg)
    }
    panel.appendChild(bar)
    const dl = el('div', 'cmp-rows')
    for (const r of rows) {
      const row = el('div', 'cmp-row')
      const dt = el('span', 'cmp-label')
      dt.appendChild(el('span', 'cmp-swatch ' + r.cls))
      dt.appendChild(document.createTextNode(r.label))
      row.appendChild(dt)
      row.appendChild(el('span', 'cmp-val', '~' + fmtTokens(breakdown ? breakdown[r.key] : undefined)))
      dl.appendChild(row)
    }
    panel.appendChild(dl)
  }

  // 鈹€鈹€ header selects (妯″瀷/鎺ㄧ悊妗?棰勮) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function presetName(id) {
    const o = S.open
    const p = o && (o.presets.presets || []).find((x) => x.id === id)
    return p ? (p.name || p.id) : (id || '鈥?)
  }

  function renderHeaderSelects() {
    const perm = $('#permPill')
    const model = $('#modelPill')
    const effort = $('#effortPill')
    const preset = $('#presetPill')
    const o = S.open
    const setLabel = (pill, text) => { if (pill) pill.textContent = text }
    if (!o) {
      // 鏃犱細璇濅篃鏄剧ず harness 搴曟爮鍏冪礌(鏉冮檺/妯″瀷/鎺ㄧ悊),棰勮涓嶅彲鐢?      const d0 = S.describe || {}
      setLabel(perm, permLabel())
      setLabel(model, [d0.provider, d0.model].filter(Boolean).join(' / ') || '妯″瀷鏈繛鎺?)
      model.disabled = true
      model.title = '鎵撳紑浼氳瘽鍚庡彲鍒囨崲妯″瀷'
      setLabel(effort, d0.reasoningEffort ? '鎺ㄧ悊:' + d0.reasoningEffort : '鎺ㄧ悊:鈥?)
      effort.disabled = true
      setLabel(preset, '棰勮:鈥?)
      preset.disabled = true
      return
    }
    perm.disabled = false
    model.disabled = false
    effort.disabled = false
    setLabel(perm, permLabel())
    const list = o.modelList || []
    const cur = currentModel()
    if (cur) setLabel(model, cur.name || cur.model)
    else setLabel(model, list.length ? '閫夋嫨妯″瀷' : '妯″瀷涓嶅彲鐢?)
    const m = cur && list.find((x) => x.provider === cur.provider && x.model === cur.model)
    const efforts = (m && m.reasoning && m.reasoning.efforts) || []
    const curEffort = cur && cur.reasoningEffort
    if (efforts.length) {
      const effName = (efforts.find((e2) => e2.id === curEffort) || efforts[0])
      setLabel(effort, '鎺ㄧ悊:' + (effName.name || effName.id))
    } else {
      setLabel(effort, '鎺ㄧ悊:鈥?)
    }
    if (o.blank) {
      preset.disabled = false
      preset.title = '绌虹櫧浼氳瘽鍙垏鎹㈤璁?
      setLabel(preset, o.preset ? '棰勮:' + presetName(o.preset) : '鏂板缓浼氳瘽閫夋嫨棰勮鈥?)
    } else {
      preset.disabled = true
      preset.title = '浼氳瘽宸插紑濮?棰勮宸插浐瀹?浠呯┖鐧戒細璇濆彲鍒囨崲)'
      setLabel(preset, '棰勮:' + presetName(o.preset))
    }
    renderContextMeter()
  }

  // 鈹€鈹€ banner / empty / settings / timeline 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function renderBanner() {
    const banner = $('.dsh-banner')
    if (!banner) return
    const bannerUp = S.server.state === 'attached' || S.server.state === 'ready'
    // 闂ㄦ帶:鎷垮埌 describe 涔嬪悗鎵嶅彲鑳藉垽瀹?鏈嶅姟鏈繍琛?;鍚﹀垯涓€寰嬫樉绀鸿繛鎺ヤ腑
    if (bannerUp && S.conn === 'connected') { banner.hidden = true; return }
    banner.hidden = false
    clear(banner)
    const serverDown = S.describe !== null && !bannerUp
    if (serverDown) {
      banner.appendChild(el('span', 'banner-text', 'dsh 鏈嶅姟鏈繍琛?' + S.server.label + ')' + (S.server.error ? ': ' + S.server.error : '')))
      const open = el('button', 'btn', '鎵撳紑娴忚鍣?)
      open.addEventListener('click', () => post({ type: 'openBrowser' }))
      banner.appendChild(open)
      const restart = el('button', 'btn', '閲嶅惎鏈嶅姟')
      restart.addEventListener('click', () => post({ type: 'restartServer' }))
      banner.appendChild(restart)
      return
    }
    banner.appendChild(el('span', 'banner-text', '姝ｅ湪杩炴帴 dsh 鏈嶅姟鈥?))
    const retry = el('button', 'btn', '閲嶈瘯')
    retry.addEventListener('click', () => post({ type: 'boot' }))
    banner.appendChild(retry)
  }

  function renderEmpty() {
    const empty = $('.dsh-empty')
    if (!empty) return
    if (S.openId) { empty.hidden = true; return }
    empty.hidden = false
    clear(empty)
    // Claude Code 椋庢牸娆㈣繋椤?灞呬腑 logo + 鏍囬 + 鎻愮ず鍗?
    const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    logo.setAttribute('viewBox', '0 0 24 24')
    logo.setAttribute('class', 'welcome-logo')
    const logoPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    logoPath.setAttribute('transform', 'translate(0.5 0.5) scale(0.46)')
    logoPath.setAttribute('fill', '#4D6BFE')
    logoPath.setAttribute('d', "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z")
    logo.appendChild(logoPath)
    empty.appendChild(logo)
    empty.appendChild(el('div', 'empty-title', 'DSH 鍔╂墜'))
    const d = S.describe || {}
    empty.appendChild(el('div', 'empty-tagline', '褰撳墠 ' + (d.provider || '鈥?) + ' / ' + (d.model || '鈥?) + (d.version ? ' 路 鏈嶅姟 v' + d.version : '')))
    const btn = el('button', 'btn primary', '鏂颁細璇?)
    btn.addEventListener('click', () => post({ type: 'createSession', cwd: S.wsPath }))
    empty.appendChild(btn)
  }

  function renderAll() {
    const o = S.open
    const msg = $('.dsh-messages')
    clear(msg)
    if (o && o.skipped > 0) {
      const note = el('div', 'msg system large-note', '宸叉姌鍙犺緝鏃╃殑 ' + o.skipped + ' 鏉′簨浠?澶т細璇濋槻鍗?')
      msg.appendChild(note)
    }
    if (!o || !o.rows.length) {
      renderEmpty()
    } else {
      // 寮€浼氳瘽涓旀湁娑堟伅:娆㈣繋/绌烘€佸繀椤婚殣钘?鍚﹀垯涓庢秷鎭垪琛ㄥ悓灞忓悇鍗犱竴鍗?
      const emptyEl = $('.dsh-empty')
      if (emptyEl) emptyEl.hidden = true
      msg.hidden = false
      for (const row of o.rows) msg.appendChild(renderRow(row))
      if (S.needScroll) msg.scrollTop = msg.scrollHeight
    }
    renderHeaderSelects()
    renderSendState()
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
      const more = el('button', 'btn load-more', '鍔犺浇鏇存棭娑堟伅')
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
    const head = el('span', 'banner-text', '鏃堕棿绾?' + ((o && o.timeline.length) || 0) + ' 浜嬩欢)')
    banner.appendChild(head)
    const closeBtn = el('button', 'btn', '鍏抽棴')
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
    const h = el('div', 'settings-head', '璁剧疆')
    aside.appendChild(h)
    const close = el('button', 'iconbtn', '脳')
    close.addEventListener('click', () => { S.settingsOpen = false; renderSettings() })
    h.appendChild(close)
    const c = S.config || {}
    const d = S.describe || {}
    const rows = [
      ['鏈嶅姟鍦板潃', 'http://127.0.0.1:' + (c.port ?? 3080)],
      ['绔彛', String(c.port ?? '鈥?)],
      ['鏈嶅姟鐗堟湰', d.version || '鈥?],
      ['涓绘満鐩綍(cwd)', d.cwd || '鈥?],
      ['褰撳墠妯″瀷', (d.provider || '') + ' / ' + (d.model || '鈥?)],
      ['DSH_HOME', S.dshHome || '鈥?],
      ['attachExisting', String(c.attachExisting)],
      ['spawnIfMissing', String(c.spawnIfMissing)],
      ['followWorkspace', String(c.followWorkspace)],
      ['stopOnExit', String(c.stopOnExit)],
      ['autoOpen(灞曞紑渚ц竟鏍?', String(c.autoOpen)],
    ]
    for (const [k, v] of rows) {
      const line = el('div', 'set-row')
      line.appendChild(el('span', 'set-key', k))
      line.appendChild(el('span', 'set-val', v))
      aside.appendChild(line)
    }
    const btns = el('div', 'set-actions')
    const open = el('button', 'btn', '鍦ㄦ祻瑙堝櫒涓墦寮€')
    open.addEventListener('click', () => post({ type: 'openBrowser' }))
    const reload = el('button', 'btn', '閲嶈浇渚ц竟鏍?)
    reload.addEventListener('click', () => post({ type: 'reload' }))
    const restart = el('button', 'btn', '閲嶅惎鏈嶅姟(浠呰嚜鍚疄渚?')
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
        btn.textContent = '宸插鍒?
        setTimeout(() => { btn.textContent = '澶嶅埗' }, 1200)
      }
    })
    const links = root.querySelectorAll && root.querySelectorAll('a')
    if (links) for (const a of links) a.addEventListener('click', (e) => {
      e.preventDefault()
      if (a.href) post({ type: 'openUrl', url: a.href })
    })
  }

  // 鈹€鈹€ boot 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  let watchdogTimer = null
  function scheduleWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer)
    watchdogTimer = setTimeout(() => {
      const tries = S.bootTries || 0
      if ((!S.describe || S.conn !== 'connected') && tries < 3) {
        console.log('[dsh] boot watchdog: re-handshaking (try ' + tries + ')')
        post({ type: 'boot' })
      }
    }, 3000)
  }
  function boot() {
    bootSkeleton()
    renderBanner()
    renderEmpty()
    post({ type: 'boot' })
    post({ type: 'listSessions' })
    post({ type: 'lastSession' })
    scheduleWatchdog()
  }
  boot()
})()
