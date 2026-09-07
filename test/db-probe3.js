'use strict'
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')
const root = 'C:/Users/20906/AppData/Roaming/Code/User/workspaceStorage'
for (const dir of fs.readdirSync(root)) {
  const dbPath = path.join(root, dir, 'state.vscdb')
  if (!fs.existsSync(dbPath)) continue
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('workbench.auxiliarybar.viewContainersWorkspaceState')
    if (row) console.log(dir.slice(0, 12), '->', String(row.value).slice(0, 300))
    const bak = fs.existsSync(dbPath + '.bak-dsh')
    if (bak) console.log('   [backup exists]')
    db.close()
  } catch (e) { console.log(dir.slice(0, 12), 'ERR', e.message) }
}
