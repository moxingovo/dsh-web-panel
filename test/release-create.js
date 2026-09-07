'use strict';
// Create GitHub Release v0.4.1 + upload vsix. Notes extracted from CHANGELOG.
const fs = require('fs');
const https = require('node:https');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
const changelog = fs.readFileSync(__dirname + '/../CHANGELOG.md', 'utf8');
const m = changelog.match(/^## 0\.4\.1\r?\n([\s\S]*?)(?=^## 0\.4\.0)/m);
const notes = (m ? m[1] : '').trim() + '\n\n安装:下载下方 dsh-webview-0.4.1.vsix,扩展面板 `...` → 从 VSIX 安装。';
function api(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: 'api.github.com', path, method, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-release', ...headers } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { if (res.statusCode >= 400) reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 200))); else resolve(JSON.parse(d)) });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
(async () => {
  let rel
  try {
    rel = await api('GET', '/repos/moxingovo/dsh-web-panel/releases/tags/v0.4.1', {})
    console.log('release exists:', rel.html_url)
  } catch (e) {
    const body = JSON.stringify({ tag_name: 'v0.4.1', name: 'DSH Web Panel v0.4.1', body: notes, draft: false })
    rel = await api('POST', '/repos/moxingovo/dsh-web-panel/releases', { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body)
    console.log('release created:', rel.html_url)
  }
  const existing = (rel.assets || []).find((a) => a.name === 'dsh-webview-0.4.1.vsix')
  if (existing) { await api('DELETE', '/repos/moxingovo/dsh-web-panel/releases/assets/' + existing.id, {}); console.log('old asset deleted') }
  const vsix = fs.readFileSync(__dirname + '/../dsh-webview-0.4.1.vsix')
  const asset = await api('POST', '/repos/moxingovo/dsh-web-panel/releases/' + rel.id + '/assets?name=dsh-webview-0.4.1.vsix', { 'Content-Type': 'application/octet-stream', 'Content-Length': vsix.length }, vsix)
  console.log('asset:', asset.browser_download_url, 'size=' + asset.size)
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
