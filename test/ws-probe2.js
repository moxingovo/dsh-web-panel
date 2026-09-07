'use strict';
// Empirical test: create sessions with cwd vs workspaceId and see grouping.
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'probe-' + Math.random().toString(36).slice(2), method, payload });
    const req = http.request({ host: '127.0.0.1', port: 3080, path: '/api/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c });
      res.on('end', () => {
        try { const j = JSON.parse(data); resolve(j.result && j.result.value !== undefined ? j.result.value : j) } catch (e) { reject(new Error('parse: ' + data.slice(0, 300))) }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
(async () => {
  // 1. What do session items look like (grouping fields)?
  const list = await rpc('session.list', {});
  console.log('session.list items=' + (list.items || []).length);
  if (list.items && list.items.length) {
    console.log('sample item:', JSON.stringify(list.items[0]).slice(0, 400));
    const cwds = {};
    for (const s of list.items) { cwds[s.cwd] = (cwds[s.cwd] || 0) + 1 }
    console.log('cwds distribution:');
    for (const [k, v] of Object.entries(cwds)) console.log('  ' + v + 'x ' + k);
  }
  // 2. Create with cwd=ds_harness
  try {
    const a = await rpc('session.create', { cwd: 'C:\\Users\\20906\\Desktop\\ds_harness' });
    console.log('\ncreate(cwd=ds_harness):', JSON.stringify(a).slice(0, 300));
    const aId = a.sessionId;
    const ws1 = await rpc('workspace.list', {});
    for (const w of (ws1.items || [])) {
      if ((w.sessionIds || []).includes(aId)) console.log('  -> landed in workspace: ' + w.path);
    }
    if (aId) await rpc('workspace.archiveSession', { sessionId: aId }).catch(() => {})
  } catch (e) { console.log('create(cwd) error:', e.message) }
  // 3. Create with workspaceId of ds_harness
  try {
    const ws0 = await rpc('workspace.list', {});
    const ds = (ws0.items || []).find((w) => String(w.path).toLowerCase().includes('ds_harness'));
    console.log('\nds_harness workspaceId:', ds && ds.workspaceId);
    const b = await rpc('session.create', { workspaceId: ds.workspaceId });
    console.log('create(workspaceId):', JSON.stringify(b).slice(0, 300));
    const bId = b.sessionId;
    const ws2 = await rpc('workspace.list', {});
    for (const w of (ws2.items || [])) {
      if ((w.sessionIds || []).includes(bId)) console.log('  -> landed in workspace: ' + w.path);
    }
    if (bId) await rpc('workspace.archiveSession', { sessionId: bId }).catch(() => {})
  } catch (e) { console.log('create(workspaceId) error:', e.message) }
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1) });
