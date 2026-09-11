'use strict';
// E2E: simulate the fixed bridge path for a folder WITHOUT an existing workspace.
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'e-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { resolve(JSON.parse(d).result) } catch (e) { reject(new Error(d.slice(0, 200))) } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
const norm = (p) => p ? String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : p;
(async () => {
  const wsRoot = 'C:\\Users\\20906\\Desktop\\c_sharp\\ConsoleApp1';
  const workspaces = await rpc('workspace.list', {});
  let target = (workspaces.value.items || []).find((w) => norm(w.path) === norm(wsRoot)) || null;
  console.log('existing workspace for ' + wsRoot + ' => ' + (target ? target.workspaceId : '(none)'));
  if (!target) {
    const created = await rpc('workspace.create', { path: wsRoot });
    target = (created.value && (created.value.workspace || created.value)) || null;
    console.log('workspace.create => id=' + (target && target.workspaceId) + ' title=' + (target && target.title));
  }
  const wsId = target && target.workspaceId ? target.workspaceId : null;
  const payload = wsId ? { workspaceId: wsId } : { cwd: wsRoot };
  console.log('session.create payload = ' + JSON.stringify(payload));
  const created = await rpc('session.create', payload);
  const sid = created.value.sessionId;
  await new Promise((r) => setTimeout(r, 800));
  const list = await rpc('session.list', {});
  const item = (list.value.items || []).find((s) => s.sessionId === sid);
  const ws2 = await rpc('workspace.list', {});
  let group = '未分组';
  for (const w of ws2.value.items || []) if ((w.sessionIds || []).includes(sid)) group = w.path;
  console.log('new session cwd = ' + (item && item.cwd));
  console.log('new session group = ' + group);
  await rpc('workspace.archiveSession', { sessionId: sid });
  console.log('archived test session');
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
