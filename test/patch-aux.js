#!/usr/bin/env node
'use strict'
// DSH aux-bar fix v3: forcibly close the core chat view in every workspace
// so VS Code cannot rebuild the "chat" aux tab at startup. Run with VS Code
// FULLY CLOSED. Idempotent; backs up state.vscdb once (state.vscdb.bak-dsh).
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(process.env.APPDATA, 'Code', 'User', 'workspaceStorage')
const AUX_KEY = 'workbench.auxiliarybar.viewContainersWorkspaceState'
const PANEL_KEY = 'workbench.panel.viewContainersWorkspaceState'
const CHAT_VIEW_KEYS = [
  'workbench.panel.chat',
  'workbench.panel.chat.numberOfVisibleViews',
]

let patched = 0
let errors = 0
for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const dbPath = path.join(root, dir.name, 'state.vscdb')
  if (!fs.existsSync(dbPath)) continue
  const bak = dbPath + '.bak-dsh'
  try {
    if (!fs.existsSync(bak)) fs.copyFileSync(dbPath, bak)
  } catch (e) { console.log('backup fail', dir.name, e.message) }

  let db
  try {
    db = new DatabaseSync(dbPath)
    const stripChat = (key) => {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key)
      if (!row) return false
      let list = []
      try { list = JSON.parse(String(row.value)) } catch { list = [] }
      if (!Array.isArray(list)) list = []
      const next = list.filter((x) => x && x.id !== 'workbench.panel.chat')
      if (next.length === list.length) return false
      db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify(next), key)
      return true
    }
    let changed = false
    if (stripChat(AUX_KEY)) changed = true
    if (stripChat(PANEL_KEY)) changed = true
    // close/kill the chat view whose open state makes the tab reappear
    for (const k of CHAT_VIEW_KEYS) {
      db.prepare('DELETE FROM ItemTable WHERE key = ?').run(k)
    }
    // ensure DSH aux container registered
    {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(AUX_KEY)
      let list = []
      try { list = JSON.parse(String(row && row.value || '[]')) } catch { list = [] }
      if (!list.some((x) => x && x.id === 'workbench.view.extension.dsh-aux')) {
        list.push({ id: 'workbench.view.extension.dsh-aux', visible: true })
        db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify(list), AUX_KEY)
        changed = true
      }
    }
    for (const k of ['memento/interactive-session-view-copilot', 'GitHub.copilot-chat', 'chat.untitledInputState', 'workbench.agentsession.auxiliarybar.viewContainersWorkspaceState']) {
      db.prepare('DELETE FROM ItemTable WHERE key = ?').run(k)
    }
    db.prepare('DELETE FROM ItemTable WHERE key LIKE ?').run('workbench.view.extension.dsh%')
    db.prepare('DELETE FROM ItemTable WHERE key LIKE ?').run('memento/webviewView.dshWebView%')
    db.close()
    patched++
    console.log('patched:', dir.name)
  } catch (e) {
    errors++
    console.log('ERROR:', dir.name, e.message)
    try { if (db) db.close() } catch {}
  }
}
console.log('done. patched=' + patched + ' errors=' + errors)
