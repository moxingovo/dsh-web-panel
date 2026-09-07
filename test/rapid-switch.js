'use strict';
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 's-' + Math.random().toString(36).slice(2), method, payload });
    const t0 = Date.now();
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => {
        const ms = Date.now() - t0;
        let ok = false, err = null;
        try { const j = JSON.parse(d); ok = j.result && j.result.ok; if (!ok) err = JSON.stringify(j.result).slice(0, 160); } catch (e) { err = d.slice(0, 160) }
        console.log(method + ' latency=' + ms + 'ms ok=' + ok + (err ? ' err=' + err : ''));
        resolve();
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
(async () => {
  // fresh session in ds_harness workspace
  const ws = await (() => new Promise((res, rej) => {
    const b = JSON.stringify({ type: 'client-request', rpcId: 's0', method: 'workspace.list', payload: {} });
    const q = http.request({ host: '127.0.0.1', port: 3080, path: '/api/workspace.list', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d).result.value)) });
    q.on('error', rej); q.write(b); q.end();
  }))();
  const ds = (ws.items || []).find((w) => String(w.path).toLowerCase().includes('ds_harness'));
  const created = await new Promise((res, rej) => {
    const b = JSON.stringify({ type: 'client-request', rpcId: 's1', method: 'session.create', payload: { workspaceId: ds.workspaceId } });
    const q = http.request({ host: '127.0.0.1', port: 3080, path: '/api/session.create', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d).result.value)) });
    q.on('error', rej); q.write(b); q.end();
  });
  console.log('created', created.sessionId.slice(0, 8));
  const sid = created.sessionId;
  const seq = [['deepseek-v4-flash', 'high'], ['deepseek-v4-pro', 'max'], ['deepseek-v4-flash', 'off'], ['deepseek-v4-pro', 'high']];
  for (const [model, effort] of seq) {
    await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model, reasoningEffort: effort });
    await new Promise((r) => setTimeout(r, 300));
  }
  await rpc('workspace.archiveSession', { sessionId: sid });
  console.log('done, session archived');
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
