'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'y-' + Math.random().toString(36).slice(2), method, payload });
    const t0 = Date.now();
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => {
        try { const j = JSON.parse(d); console.log(method + ' latency=' + (Date.now() - t0) + 'ms ok=' + j.result.ok); resolve(j.result) } catch (e) { reject(new Error(d.slice(0, 300))) }
      });
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
  // 1) find a busy session and try selectModel on it
  const busy = mine.find((s) => s.running);
  console.log('busy session:', busy ? busy.sessionId.slice(0, 8) + ' running=' + busy.running : 'none');
  if (busy) {
    const r = await rpc('session.selectModel', { sessionId: busy.sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' });
    console.log('selectModel-on-busy result:', JSON.stringify(r).slice(0, 260));
  }
  // 2) find any /plan user message shape in recent history
  for (const s of mine.slice(0, 3)) {
    const h = await rpc('session.history', { sessionId: s.sessionId });
    const tail = (h.events || []).slice(-400);
    for (const e of tail) {
      if (e.event.type === 'user/message') {
        const txt = JSON.stringify(e.event.data || {});
        if (txt.includes('plan')) {
          console.log('PLAN-SHAPED user/message in ' + s.sessionId.slice(0, 8) + ':', txt.slice(0, 400));
          process.exit(0);
        }
      }
    }
  }
  console.log('no /plan user message found in recent history of top-3 sessions');
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
