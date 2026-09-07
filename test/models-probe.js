'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'm-' + Math.random().toString(36).slice(2), method, payload });
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
  const v = await rpc('session.models', { sessionId: 'session-43024f44-3327-46e2-9349-4208fa718f4f' });
  console.log(JSON.stringify(v, null, 1).slice(0, 2600));
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
