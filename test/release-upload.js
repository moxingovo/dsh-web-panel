'use strict';
const fs = require('fs');
const https = require('node:https');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
function req(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ host: u.hostname, path: u.pathname + u.search, method, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-release', ...headers } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { if (res.statusCode >= 400) reject(new Error(method + ' ' + res.statusCode + ' ' + d.slice(0, 200))); else resolve({ code: res.statusCode, body: d ? JSON.parse(d) : null }) });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
(async () => {
  const rel = (await req('GET', 'https://api.github.com/repos/moxingovo/dsh-web-panel/releases/tags/v0.4.1', {})).body;
  console.log('release id=' + rel.id + ' upload_url=' + rel.upload_url);
  const up = rel.upload_url.replace(/\{.*\}/, '');
  const vsix = fs.readFileSync(__dirname + '/../dsh-webview-0.4.1.vsix');
  const a = await req('POST', up + '?name=dsh-webview-0.4.1.vsix', { 'Content-Type': 'application/octet-stream', 'Content-Length': vsix.length }, vsix);
  console.log('uploaded: ' + a.body.browser_download_url + ' size=' + a.body.size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
