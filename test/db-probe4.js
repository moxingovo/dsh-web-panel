'use strict'
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync('C:/Users/20906/AppData/Roaming/Code/User/workspaceStorage/585c816fe0f3aa55a26f39023a111c2d/state.vscdb', { readOnly: true })
const rows = db.prepare('SELECT key, value FROM ItemTable').all()
for (const r of rows) {
  const k = String(r.key)
  if (/aux|sidebar|view\.extension|chat/i.test(k)) {
    const v = String(r.value || '')
    console.log('KEY:', k, '=>', v.slice(0, 220))
  }
}
db.close()
