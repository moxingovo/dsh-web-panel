'use strict'
const { DatabaseSync } = require('node:sqlite')
for (const dir of ['585c816fe0f3aa55a26f39023a111c2d', '13b07a4a4f2a80bc5fc4e16a9f454ac0']) {
  const db = new DatabaseSync('C:/Users/20906/AppData/Roaming/Code/User/workspaceStorage/' + dir + '/state.vscdb', { readOnly: true })
  const aux = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('workbench.auxiliarybar.viewContainersWorkspaceState')
  const chat = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('workbench.panel.chat')
  console.log(dir.slice(0,8), 'aux=', String(aux && aux.value || 'NONE').slice(0, 200))
  console.log('   chatViewKey=', chat ? 'STILL EXISTS' : 'DELETED')
  db.close()
}
