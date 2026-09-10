'use strict';
// Probe which model ids the live API accepts (tiny text-only requests).
const fs = require('fs');
const https = require('node:https');
const cred = fs.readFileSync(process.env.USERPROFILE + '\\.dsh\\.credentials.yaml', 'utf8');
const key = (cred.match(/sk-[A-Za-z0-9_-]+/) || [])[0];
if (!key) { console.error('no key'); process.exit(1) }
function chat(model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false });
    const req = https.request({ host: 'api.deepseek.com', path: '/chat/completions', method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => resolve({ model, code: res.statusCode, body: d.slice(0, 160) }));
    });
    req.on('error', (e) => resolve({ model, code: 'ERR', body: e.message }));
    req.write(body); req.end();
  });
}
(async () => {
  const ids = ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-flash-vision-exp', 'deepseek-v4-flash-vision-exp', 'deepseek-flash-vision', 'deepseek-v4-flash'];
  for (const id of ids) {
    const r = await chat(id);
    console.log(r.model.padEnd(32) + ' -> HTTP ' + r.code + ' ' + r.body.replace(/\s+/g, ' '));
  }
})();
