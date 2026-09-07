'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'x-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { const j = JSON.parse(d); resolve(j.result.value) } catch (e) { reject(new Error(d.slice(0, 200))) } });
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
  for (const s of mine.slice(0, 3)) {
    const h = await rpc('session.history', { sessionId: s.sessionId });
    const events = h.events || [];
    const tail = events.slice(-120);
    let planState = null;
    for (const e of tail) {
      if (e.event.type === 'plan/mode') planState = e.event.data;
      if (e.event.type === 'command/run' && e.event.data && e.event.data.name === 'plan') {
        console.log(s.sessionId.slice(0, 8) + ' :: command/run plan @ ' + new Date(e.time || 0).toLocaleTimeString());
      }
    }
    const lastUser = [...tail].reverse().find((e) => e.event.type === 'user/message');
    console.log(s.sessionId.slice(0, 8) + ' :: lastUser=' + JSON.stringify(lastUser && lastUser.event.data || {}).slice(0, 140));
    console.log(s.sessionId.slice(0, 8) + ' :: planState=' + JSON.stringify(planState) + ' updatedAt=' + new Date(s.updatedAt).toLocaleTimeString());
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
