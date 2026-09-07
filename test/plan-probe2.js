'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'p-' + Math.random().toString(36).slice(2), method, payload });
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
  const h = await rpc('session.history', { sessionId: 'session-43024f44-3327-46e2-9349-4208fa718f4f' });
  const events = h.events || [];
  const tail = events.slice(-300);
  let found = 0;
  for (const e of tail) {
    if (e.event.type === 'plan/mode' || e.event.type === 'command/run' || e.event.type === 'command/done') {
      found++;
      console.log(e.event.type + ' :: ' + JSON.stringify(e.event.data || {}).slice(0, 200));
    }
  }
  if (!found) console.log('no plan/mode or command events in the last 300 events');
  // also check user messages in tail for /plan
  for (const e of tail) {
    if (e.event.type === 'user/message') {
      const txt = JSON.stringify(e.event.data || {}).slice(0, 220);
      if (txt.includes('/plan') || txt.includes('plan')) console.log('user msg :: ' + txt);
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
