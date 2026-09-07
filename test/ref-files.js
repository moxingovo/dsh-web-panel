'use strict';
const fs = require('fs');
const https = require('node:https');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
function get(path) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'api.github.com', path, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-ref', 'Accept': 'application/vnd.github.raw+json' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { if (res.statusCode === 200) resolve(d); else reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 120))) });
    }).on('error', reject);
  });
}
(async () => {
  const base = '/repos/skymecode/deepseek-harness-for-vscode/contents/';
  for (const f of ['.github/workflows/release.yml', '.vscodeignore', '.editorconfig', 'THIRD_PARTY_NOTICES.md', '.vscode/launch.json', '.vscode/tasks.json', '.gitignore']) {
    try {
      const t = await get(base + f);
      console.log('\n' + '='.repeat(20) + ' FILE: ' + f + ' (' + t.length + 'B) ' + '='.repeat(20));
      console.log(t.slice(0, 6000));
    } catch (e) { console.log('\n=== FILE: ' + f + ' :: ' + e.message) }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
