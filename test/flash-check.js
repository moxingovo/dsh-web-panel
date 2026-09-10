'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'x-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { resolve(JSON.parse(d).result) } catch (e) { reject(new Error(d.slice(0, 200))) } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
(async () => {
  const list = await rpc('session.list', {});
  const items = list.value.items || [];
  const xing = items.filter((s) => {
    const title = (s.projections && s.projections.values && s.projections.values.title) || '';
    return /星盘|xingpan/i.test(title) || /xingpan/i.test(s.agentPreset || '')
  });
  console.log('xingpan-ish sessions:', xing.length);
  for (const s of xing.slice(0, 5)) {
    const title = (s.projections && s.projections.values && s.projections.values.title) || '(no title)';
    console.log('  ' + s.sessionId.slice(0, 12) + ' title=' + title + ' preset=' + s.agentPreset + ' running=' + s.running);
  }
  const target = xing[0] || items.find((s) => s.running) || items[0];
  if (!target) { console.log('no session'); return }
  console.log('\n--- try selectModel flash on ' + target.sessionId.slice(0, 12) + ' ---');
  const sel = await rpc('session.selectModel', { sessionId: target.sessionId, provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' });
  console.log(JSON.stringify(sel).slice(0, 400));
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
