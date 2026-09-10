'use strict'
// E2E: create session -> select new beta model -> send an image -> expect streaming.
const zlib = require('node:zlib')
const { DshClient } = require('C:/Users/20906/source/dsh-web-panel/src/protocol.js')

// --- minimal PNG encoder (64x64 solid orange) ---
function crc32 (buf) {
  let c, crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk (type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function makePng (w, h, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = []
  for (let y = 0; y < h; y++) {
    raw.push(Buffer.from([0]))
    for (let x = 0; x < w; x++) raw.push(Buffer.from(rgb))
  }
  const idat = zlib.deflateSync(Buffer.concat(raw))
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const MODEL = 'deepseek-v4.1-flash-expires-on-0910'
;(async () => {
  const client = new DshClient({ baseUrl: 'http://127.0.0.1:3080', log: () => {} })
  const frames = []
  client.on('mux', (f) => frames.push(f))
  client.on('host', (f) => { if (f.type === 'host/agent-error') frames.push(f) })

  const created = await client.request('session.create', { cwd: process.env.DSH_SMOKE_CWD || require('node:os').homedir() })
  const sid = created.sessionId
  console.log('[session]', sid)
  const sel = await client.request('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: MODEL })
  console.log('[model selected]', JSON.stringify(sel.selected))
  client.open()
  await new Promise((r) => setTimeout(r, 1500))

  const png = makePng(64, 64, [255, 140, 0])
  const prompt = await client.request('session.prompt', {
    sessionId: sid,
    mode: 'queue',
    content: [
      { type: 'text', text: '这张图是什么颜色?只回答颜色名称。' },
      { type: 'image', mediaType: 'image/png', data: png.toString('base64'), name: 'orange64.png' },
    ],
  })
  console.log('[prompt accepted]', JSON.stringify(prompt))

  const deadline = Date.now() + 120000
  let text = '', sawImageEcho = false, errorMsg = ''
  while (Date.now() < deadline) {
    for (const f of frames) {
      if (f.sessionId !== sid) continue
      if (f.type === 'session/event') {
        const ev = f.event
        if (ev.type === 'user/message' && (ev.data.message.content || []).some((b) => b.type === 'image')) sawImageEcho = true
        if (ev.type === 'assistant/chunk' && ev.data.chunk.type === 'text-delta') text += ev.data.chunk.text
        if (ev.type === 'turn/end') { if (!text) { /* wait a moment */ } }
      }
      if (f.type === 'host/agent-error') errorMsg = f.message || JSON.stringify(f)
    }
    if (text.length > 0 || errorMsg) break
    await new Promise((r) => setTimeout(r, 400))
  }
  console.log('[image accepted by host]', sawImageEcho)
  console.log('[assistant text]', JSON.stringify(text.slice(0, 300)))
  if (errorMsg) console.log('[agent error]', errorMsg.slice(0, 300))
  await client.request('session.cancel', { sessionId: sid }).catch(() => {})
  await client.request('workspace.archiveSession', { sessionId: sid }).catch(() => {})
  console.log('[cleanup] archived')
  client.close()
  process.exit(text ? 0 : 1)
})().catch((e) => { console.error('[fatal]', e.code || '', e.message); process.exit(2) })
