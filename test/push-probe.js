'use strict';
// Does selectModel push any mux frame? Subscribe, switch, watch 4s.
const { SimpleWebSocket: WebSocket } = require('C:/Users/20906/source/dsh-web-panel/src/websocket.js');
const http = require('node:http');
function rpc(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'push-' + Math.random().toString(36).slice(2), method, payload });
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
  const sid = 'session-43024f44-3327-46e2-9349-4208fa718f4f';
  let frames = [];
  const ws = new WebSocket('ws://127.0.0.1:3080/api/events.mux');
  await new Promise((resolve, reject) => {
    ws.open({
      onOpen: resolve,
      onMessage: (data) => {
        try {
          const f = JSON.parse(data.toString());
          const t = f.payload && f.payload.type;
          if (t === 'session/projection') frames.push('projection:' + f.payload.key);
          else if (t === 'session/event') frames.push('event:' + (f.payload.event && f.payload.event.type));
          else if (t === 'session/subscribed') frames.push('subscribed:' + String(f.payload.sessionId).slice(0, 8));
          else frames.push(t);
        } catch {}
      },
      onError: reject,
      onClose: () => {},
    });
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log('--- frames before switch ---');
  console.log([...frames].slice(-8).join('\n'));
  frames = [];
  await rpc('session.selectModel', { sessionId: sid, provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' });
  console.log('--- switched model (pro/high), watching 4s ---');
  await new Promise((r) => setTimeout(r, 4000));
  console.log(frames.length ? frames.join('\n') : 'NO FRAMES AT ALL after selectModel');
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
