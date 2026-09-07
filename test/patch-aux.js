#!/usr/bin/env node
'use strict'
// DSH aux-bar fix v2 (node:sqlite): remove the core chat tab from every
// workspace's auxiliary-bar state, register the DSH container there, and drop
// the leftover left-sidebar DSH view state. Run with VS Code FULLY CLOSED.
// Idempotent; backs up each state.vscdb once (state.vscdb.bak-dsh).
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(process.env.APPDATA, 'Code', 'User', 'workspaceStorage')
const AUX_KEY = 'workbench.auxiliarybar.viewContainersWorkspaceState'
const staleKeys = [
  'workbench.panel.chat',
  'workbench.panel.chat.numberOfVisibleViews',
  'memento/interactive-session-view-copilot',
  'GitHub.copilot-chat',
  'workbench.agentsession.auxiliarybar.viewContainersWorkspaceState',
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
    const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(AUX_KEY)
    if (!row) { db.close(); continue }
    let list = []
    try { list = JSON.parse(String(row.value)) } catch (e) { list = [] }
    const next = list.filter((x) => x && x.id !== 'workbench.panel.chat')
    if (!next.some((x) => x.id === 'workbench.view.extension.dsh-aux')) {
      next.push({ id: 'workbench.view.extension.dsh-aux', visible: true })
    }
    const nextJson = JSON.stringify(next)
    db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(nextJson, AUX_KEY)
    for (const k of staleKeys) {
      db.prepare('DELETE FROM ItemTable WHERE key = ?').run(k)
    }
    db.prepare('DELETE FROM ItemTable WHERE key LIKE ?').run('workbench.view.extension.dsh%')
    db.prepare('DELETE FROM ItemTable WHERE key LIKE ?').run('memento/webviewView.dshWebView%')
    db.close()
    patched++
    console.log('patched:', dir.name, '->', nextJson.slice(0, 160))
  } catch (e) {
    errors++
    console.log('ERROR:', dir.name, e.message)
    try { if (db) db.close() } catch {}
  }
}
console.log('done. patched=' + patched + ' errors=' + errors)
