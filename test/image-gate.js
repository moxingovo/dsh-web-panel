'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'y-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { resolve(JSON.parse(d).result) } catch (e) { reject(new Error(d.slice(0, 200))) } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
function hasImage(content) {
  return Array.isArray(content) && content.some((b) => b && b.type === 'image')
}
(async () => {
  const list = await rpc('session.list', {});
  const items = (list.value.items || []).slice(0, 40);
  let found = null;
  for (const s of items) {
    const h = await rpc('session.history', { sessionId: s.sessionId, maxMessages: 60 });
    const evs = (h.value.events || []).map((e) => e.event);
    const imgMsg = evs.find((e) => e.type === 'user/message' && hasImage(e.data && e.data.message && e.data.message.content));
    if (imgMsg) { found = s; break }
  }
  if (!found) { console.log('no session with images found in the first 40'); return }
  const title = (found.projections && found.projections.values && found.projections.values.title) || '(no title)';
  console.log('session with images: ' + found.sessionId.slice(0, 12) + ' title=' + title);
  const asPro = await rpc('session.selectModel', { sessionId: found.sessionId, provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' });
  console.log('select pro (text-only) => ' + JSON.stringify(asPro).slice(0, 260));
  const asFlash = await rpc('session.selectModel', { sessionId: found.sessionId, provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' });
  console.log('select flash (should accept image) => ' + JSON.stringify(asFlash).slice(0, 260));
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
