'use strict';
// List the reference repo tree (skymecode/deepseek-harness-for-vscode) via GitHub API.
const fs = require('fs');
const https = require('node:https');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
function get(path) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'api.github.com', path, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-ref', 'Accept': 'application/vnd.github+json' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(new Error(d.slice(0, 200))) } });
    }).on('error', reject);
  });
}
(async () => {
  const tree = await get('/repos/skymecode/deepseek-harness-for-vscode/git/trees/main?recursive=1');
  const paths = (tree.tree || []).map((t) => t.path).filter((p) => !p.includes('node_modules') && !p.startsWith('lib/') && !p.startsWith('out/') && !p.startsWith('src/') && !p.startsWith('resources/'));
  console.log(paths.join('\n'));
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
