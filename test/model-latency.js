'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 't-' + Math.random().toString(36).slice(2), method, payload });
    const t0 = Date.now();
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => {
        try { const j = JSON.parse(d); console.log(method, 'latency=' + (Date.now() - t0) + 'ms'); resolve(j.result.value) } catch (e) { reject(new Error(d.slice(0, 200))) }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
(async () => {
  const sid = 'session-43024f44-3327-46e2-9349-4208fa718f4f';
  await rpc('session.models', { sessionId: sid });
  const v = await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' });
  console.log('selectModel result:', JSON.stringify(v).slice(0, 200));
  const v2 = await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' });
  console.log('selectModel2 result:', JSON.stringify(v2).slice(0, 200));
  await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' });
  console.log('restored pro/max');
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
