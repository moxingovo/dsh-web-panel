'use strict'
const { call } = require('../src/protocol')
;(async () => {
  const list = await call('http://127.0.0.1:3080', 'session.list', {})
  const ws = await call('http://127.0.0.1:3080', 'workspace.list', {}).catch(() => null)
  console.log('total sessions:', list.items.length)
  console.log('workspace.list:', JSON.stringify(ws).slice(0, 500))
  const norm = (p) => p ? String(p).replace(/[\\/]+$/, '').toLowerCase() : p
  const java = list.items.filter((s) => norm(s.cwd) === norm('C:\\Users\\20906\\Desktop\\java'))
  console.log('java sessions:', java.length, java.map((s) => s.sessionId.slice(0, 12) + ' blank=' + s.blank + ' preset=' + s.agentPreset).join(' | '))
  console.log('sample cwds:', list.items.slice(0, 6).map((s) => s.cwd).join(' , '))
})().catch((e) => { console.error(e.message); process.exit(1) })
