'use strict'
// DSH state fix v4 — comprehensive, exact-match surgery on VS Code storage.
// MUST be run with VS Code FULLY CLOSED (otherwise VS Code overwrites on exit).
// Idempotent; one backup per DB (state.vscdb.bak-dsh).
//
// What it does:
//  GLOBAL storage:
//   - aux pinnedPanels:           remove chat + stale 'dsh'; ensure claude + dsh-aux pinned
//   - aux placeholderPanels:      remove chat + stale 'dsh'
//   - panel.chat.hidden:          ensure chat view isHidden:true
//   - activity pinnedViewlets2:   remove stale 'dsh'
//   - stale keys: workbench.view.extension.dsh.*
//  EVERY workspace storage:
//   - aux viewContainersWorkspaceState: remove chat + stale 'dsh'; ensure claude + dsh-aux visible
//   - panel viewContainersWorkspaceState: remove chat + stale 'dsh'
//   - workbench.panel.chat:       force view isHidden:true (prevents tab resurrection)
//   - activity viewletsWorkspaceState: remove stale 'dsh'
//   - auxiliarybar.activepanelid: clear if it points at chat
//   - stale keys: workbench.view.extension.dsh.* / memento/webviewView.dshWebView / copilot leftovers
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const CHAT = 'workbench.panel.chat'
const STALE = 'workbench.view.extension.dsh'
const OURS = 'workbench.view.extension.dsh-aux'
const CC = 'workbench.view.extension.claude-sidebar-secondary'

function backupOnce(dbPath) {
  const bak = dbPath + '.bak-dsh'
  if (!fs.existsSync(bak)) {
    try { fs.copyFileSync(dbPath, bak) } catch (e) { console.log('  backup fail:', e.message) }
  }
}

function getJson(db, key) {
  const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key)
  if (!row) return null
  try { return JSON.parse(String(row.value)) } catch { return null }
}

function setJson(db, key, val) {
  const s = JSON.stringify(val)
  const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key)
  if (row) db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(s, key)
  else db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(key, s)
}

function delKey(db, key) {
  db.prepare('DELETE FROM ItemTable WHERE key = ?').run(key)
}

// Filter an array list by id; returns [nextList, changed]
function filterList(list, keepIds) {
  const next = []
  let changed = false
  for (const x of list) {
    if (!x || typeof x.id !== 'string') { next.push(x); continue }
    if (keepIds.has(x.id)) { next.push(x); continue }
    changed = true // dropped
  }
  return [next, changed]
}

function ensureEntry(list, id, maker) {
  const idx = list.findIndex((x) => x && x.id === id)
  if (idx >= 0) return [list, false]
  return [[...list, maker()], true]
}

function processWorkspace(dbPath) {
  const db = new DatabaseSync(dbPath)
  let changed = false
  const mark = (c) => { if (c) changed = true }

  const aux = getJson(db, 'workbench.auxiliarybar.viewContainersWorkspaceState')
  if (Array.isArray(aux)) {
    let [l, c] = filterList(aux, new Set([OURS, CC]))
    let [l2, c2] = ensureEntry(l, OURS, () => ({ id: OURS, visible: true }))
    let [l3, c3] = ensureEntry(l2, CC, () => ({ id: CC, visible: true }))
    mark(c || c2 || c3)
    setJson(db, 'workbench.auxiliarybar.viewContainersWorkspaceState', l3)
  }

  const panel = getJson(db, 'workbench.panel.viewContainersWorkspaceState')
  if (Array.isArray(panel)) {
    let [l, c] = filterList(panel, new Set([OURS, CC]))
    mark(c)
    setJson(db, 'workbench.panel.viewContainersWorkspaceState', l)
  }

  // Force the core chat VIEW closed (keeps the key so VS Code does not recreate it as open)
  const chatView = getJson(db, CHAT)
  if (chatView === null || typeof chatView !== 'object') {
    setJson(db, CHAT, { 'workbench.panel.chat.view.copilot': { collapsed: false, isHidden: true } })
    mark(true)
  } else {
    const v = chatView['workbench.panel.chat.view.copilot']
    if (!v || v.isHidden !== true) {
      setJson(db, CHAT, { ...chatView, 'workbench.panel.chat.view.copilot': { collapsed: false, isHidden: true } })
      mark(true)
    }
  }
  delKey(db, CHAT + '.numberOfVisibleViews')

  const act = getJson(db, 'workbench.activity.viewletsWorkspaceState')
  if (Array.isArray(act)) {
    let [l, c] = filterList(act, new Set([OURS, CC]))
    mark(c)
    setJson(db, 'workbench.activity.viewletsWorkspaceState', l)
  }

  const activeId = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('workbench.auxiliarybar.activepanelid')
  if (activeId && String(activeId.value).includes(CHAT)) { delKey(db, 'workbench.auxiliarybar.activepanelid'); mark(true) }
  if (activeId && String(activeId.value) === STALE) { setJson(db, 'workbench.auxiliarybar.activepanelid', OURS); mark(true) }

  for (const k of ['workbench.view.extension.dsh.state', 'workbench.view.extension.dsh.state.hidden', 'workbench.view.extension.dsh.numberOfVisibleViews', 'memento/webviewView.dshWebView', 'memento/interactive-session-view-copilot', 'GitHub.copilot-chat']) {
    delKey(db, k)
  }

  db.close()
  return changed
}

function processGlobal(dbPath) {
  const db = new DatabaseSync(dbPath)
  let changed = false
  const mark = (c) => { if (c) changed = true }

  const pin = getJson(db, 'workbench.auxiliarybar.pinnedPanels')
  if (Array.isArray(pin)) {
    let [l, c] = filterList(pin, new Set([OURS, CC]))
    let [l2, c2] = ensureEntry(l, OURS, () => ({ id: OURS, pinned: true, visible: false, order: 102 }))
    let [l3, c3] = ensureEntry(l2, CC, () => ({ id: CC, pinned: true, visible: false, order: 101 }))
    mark(c || c2 || c3)
    setJson(db, 'workbench.auxiliarybar.pinnedPanels', l3)
  }

  const ph = getJson(db, 'workbench.auxiliarybar.placeholderPanels')
  if (Array.isArray(ph)) {
    let [l, c] = filterList(ph, new Set([OURS, CC]))
    mark(c)
    setJson(db, 'workbench.auxiliarybar.placeholderPanels', l)
  }

  setJson(db, 'workbench.panel.chat.hidden', [{ id: 'workbench.panel.chat.view.copilot', isHidden: true }])

  const act = getJson(db, 'workbench.activity.pinnedViewlets2')
  if (Array.isArray(act)) {
    let [l, c] = filterList(act, new Set([OURS, CC]))
    mark(c)
    setJson(db, 'workbench.activity.pinnedViewlets2', l)
  }

  for (const k of ['workbench.view.extension.dsh.state.hidden', 'workbench.view.extension.dsh.state']) delKey(db, k)

  db.close()
  return changed
}

let globalChanged = false
let wsPatched = 0
let wsChanged = 0
let errors = 0

const globalPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb')
if (fs.existsSync(globalPath)) {
  backupOnce(globalPath)
  try {
    globalChanged = processGlobal(globalPath)
    console.log('global:', globalChanged ? 'CHANGED' : 'already-clean')
  } catch (e) { errors++; console.log('global ERROR:', e.message) }
} else {
  console.log('global: not found at ' + globalPath)
}

const wsRoot = path.join(process.env.APPDATA, 'Code', 'User', 'workspaceStorage')
if (fs.existsSync(wsRoot)) {
  for (const dir of fs.readdirSync(wsRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const dbPath = path.join(wsRoot, dir.name, 'state.vscdb')
    if (!fs.existsSync(dbPath)) continue
    backupOnce(dbPath)
    try {
      const c = processWorkspace(dbPath)
      wsPatched++
      if (c) { wsChanged++; console.log('workspace:', dir.name, 'CHANGED') }
    } catch (e) { errors++; console.log('workspace ERROR:', dir.name, e.message) }
  }
}

console.log('')
console.log('SUMMARY globalChanged=' + globalChanged + ' workspaces=' + wsPatched + ' changed=' + wsChanged + ' errors=' + errors)
if (errors === 0) console.log('OK — state fixed. Now reopen VS Code: chat gone, DSH icon pinned top-right.')
