'use strict';
// Behavioural test: create a session, send a real image, then try both models.
// Expect: pro (text-only) rejected with model-unavailable; flash (image-capable) accepted.
const http = require('node:http');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'g-' + Math.random().toString(36).slice(2), method, payload });
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
  const ws = await rpc('workspace.list', {});
  const ds = (ws.value.items || []).find((w) => String(w.path).toLowerCase().includes('ds_harness'));
  const created = await rpc('session.create', { workspaceId: ds.workspaceId });
  const sid = created.value.sessionId;
  console.log('test session: ' + sid.slice(0, 12));
  const sent = await rpc('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '图片能力测试' }, { type: 'image', mediaType: 'image/png', data: PNG }] });
  console.log('prompt with image => ' + JSON.stringify(sent).slice(0, 200));
  await new Promise((r) => setTimeout(r, 1500));
  const asPro = await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' });
  console.log('select pro (text-only) => ok=' + asPro.ok + ' ' + JSON.stringify(asPro.error ? asPro.error.code + ': ' + asPro.error.message : asPro.value).slice(0, 200));
  const asFlash = await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' });
  console.log('select flash (image-capable) => ok=' + asFlash.ok + ' ' + JSON.stringify(asFlash.error ? asFlash.error.code + ': ' + asFlash.error.message : asFlash.value).slice(0, 200));
  await rpc('workspace.archiveSession', { sessionId: sid });
  console.log('test session archived');
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
