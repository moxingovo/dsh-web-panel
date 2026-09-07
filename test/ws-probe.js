'use strict';
// Probe the live 3080 service: describe fields, workspaces, sample session cwds.
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'probe-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c });
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('parse: ' + data.slice(0, 200))) }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
(async () => {
  const desc = await rpc('host.describe', {});
  console.log('=== host.describe ===');
  console.log(JSON.stringify(desc).slice(0, 1500));
  const ws = await rpc('workspace.list', {});
  console.log('\n=== workspace.list ===');
  console.log(JSON.stringify(ws).slice(0, 2000));
  const list = await rpc('session.list', {});
  const items = (list.items || []);
  console.log('\n=== session.list total=' + items.length + ' sample cwds ===');
  const cwds = {};
  for (const s of items) { cwds[s.cwd] = (cwds[s.cwd] || 0) + 1 }
  for (const [k, v] of Object.entries(cwds)) console.log('  ' + v + 'x  ' + k);
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1) });
