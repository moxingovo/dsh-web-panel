'use strict'
const { call } = require('C:/Users/20906/source/dsh-web-panel/src/protocol.js')
;(async () => {
  const h = await call('http://127.0.0.1:3080', 'session.history', { sessionId: 'session-45581179-3cd0-4eb5-96fa-b7cbec5a546e', maxMessages: 6 })
  const evs = (h.events || []).map((e) => e.event)
  const counts = {}
  for (const e of evs) counts[e.type] = (counts[e.type] || 0) + 1
  console.log('EVENT TYPES:', JSON.stringify(counts))
  const img = evs.find((e) => e.type === 'user/message' && (e.data.message.content || []).some((b) => b.type === 'image'))
  console.log('image in user message:', !!img, img ? JSON.stringify(img.data.message.content.map((b) => b.type + (b.mediaType ? ':' + b.mediaType : ''))) : '')
  const assistant = evs.filter((e) => e.type === 'assistant/message').pop()
  if (assistant) console.log('ASSISTANT:', JSON.stringify(assistant.data.message.content).slice(0, 400))
  const err = evs.find((e) => e.type === 'assistant/message' && e.data.message.content.some((b) => b.type === 'error'))
  const hdr = evs.find((e) => e.type === 'request/header')
  if (hdr) console.log('REQUEST HEADER:', JSON.stringify(hdr.data).slice(0, 260))
  const last = evs[evs.length - 1]
  console.log('LAST EVENT:', last ? last.type : 'none', JSON.stringify(last && last.data).slice(0, 200))
})().catch((e) => { console.error('ERR', e.code, e.message); process.exit(1) })
