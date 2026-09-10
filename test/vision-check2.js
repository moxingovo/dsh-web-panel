'use strict'
const { call } = require('C:/Users/20906/source/dsh-web-panel/src/protocol.js')
const sid = 'session-45581179-3cd0-4eb5-96fa-b7cbec5a546e'
;(async () => {
  const h = await call('http://127.0.0.1:3080', 'session.history', { sessionId: sid, maxMessages: 8 })
  const evs = (h.events || []).map((e) => e.event)
  for (const e of evs) {
    if (e.type === 'user/message') {
      const c = (e.data && e.data.message && e.data.message.content) || []
      console.log('USER MSG blocks:', c.map((b) => b.type + (b.mediaType ? '(' + b.mediaType + ',' + String(b.data || '').length + 'b64chars)' : '')).join(', '))
    } else if (e.type === 'assistant/message') {
      const c = (e.data && e.data.message && e.data.message.content) || []
      console.log('ASSISTANT blocks:', c.map((b) => b.type).join(', '))
      const txt = c.filter((b) => b.type === 'text').map((b) => b.text).join('')
      console.log('ASSISTANT text:', JSON.stringify(txt.slice(0, 400)))
    } else if (e.type === 'request/header') {
      console.log('REQUEST HEADER:', JSON.stringify(e.data).slice(0, 300))
    } else if (e.type === 'assistant/chunk') {
      const ch = e.data && e.data.chunk
      console.log('CHUNK:', ch && ch.type, ch && ch.type === 'text-delta' ? JSON.stringify(ch.text) : (ch && ch.blockType ? ch.blockType : ''))
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
