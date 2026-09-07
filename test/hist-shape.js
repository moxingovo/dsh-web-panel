'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'h-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { resolve(JSON.parse(d).result.value) } catch (e) { reject(new Error(d.slice(0, 200))) } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
(async () => {
  const h = await rpc('session.history', { sessionId: 'session-43024f44-3327-46e2-9349-4208fa718f4f' });
  const ev = (h.events || [])[0];
  console.log('entry keys:', Object.keys(ev || {}));
  console.log('entry sample:', JSON.stringify(ev).slice(0, 300));
  const ev2 = (h.events || [])[1];
  console.log('entry2 sample:', JSON.stringify(ev2).slice(0, 300));
  console.log('hasMore=', h.hasMore, 'total events=', (h.events || []).length);
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
