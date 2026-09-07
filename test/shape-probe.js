'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'z-' + Math.random().toString(36).slice(2), method, payload });
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
  for (const s of mine) {
    const h = await rpc('session.history', { sessionId: s.sessionId });
    const events = h.events || [];
    const tail = events.slice(-250);
    for (let i = 0; i < tail.length; i++) {
      const e = tail[i];
      if (e.event.type === 'command/run' && e.event.data && e.event.data.name === 'plan') {
        console.log('=== session ' + s.sessionId.slice(0, 8) + ' has plan command/run @idx ' + i);
        console.log('command/run data:', JSON.stringify(e.event.data).slice(0, 300));
        // neighbors
        for (let j = Math.max(0, i - 3); j <= Math.min(tail.length - 1, i + 3); j++) {
          const n = tail[j];
          console.log('  [' + (j - i) + '] ' + n.event.type + ' :: ' + JSON.stringify(n.event.data || {}).slice(0, 260));
        }
        return;
      }
    }
  }
  console.log('no command/run plan found in any ds_harness session last-250');
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
