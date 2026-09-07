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
    const rows = db.prepare('SELECT key FROM ItemTable').all()
    const keys = rows.map(r => r.key)
    const aux = keys.filter(k => /auxiliary|sidebar|chat|view|layout/i.test(k))
    if (aux.length) {
      console.log('=== ' + dir + ' (' + keys.length + ' keys) ===')
      console.log(aux.join('\n').slice(0, 2500))
    }
    db.close()
  } catch (e) { console.log(dir, 'ERR', e.message) }
}
