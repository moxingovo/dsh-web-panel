'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'p-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { const j = JSON.parse(d); resolve(j.result.value) } catch (e) { reject(new Error(d.slice(0, 300))) } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
(async () => {
  const list = await rpc('session.list', {});
  const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const mine = (list.items || []).filter((s) => norm(s.cwd) === norm('C:/Users/20906/Desktop/ds_harness'));
  mine.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const top = mine[0];
  console.log('most recent ds_harness session:', top && top.sessionId, 'updated', top && new Date(top.updatedAt).toLocaleTimeString());
  if (!top) return;
  const h = await rpc('session.history', { sessionId: top.sessionId });
  const events = h.events || [];
  console.log('events:', events.length);
  const tail = events.slice(-14);
  for (const e of tail) {
    console.log('  seq=' + e.seq + ' ' + e.event.type + ' ' + JSON.stringify(e.event.data || {}).slice(0, 160));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
