'use strict';
const fs = require('fs');
const https = require('node:https');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
function get(path) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'api.github.com', path, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-release', 'Accept': 'application/vnd.github+json' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c });
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(new Error(d.slice(0, 200))) } });
    }).on('error', reject);
  });
}
(async () => {
  const jobs = await get('/repos/moxingovo/dsh-web-panel/actions/runs/34131208414/jobs');
  for (const j of jobs.jobs || []) {
    console.log('job:', j.name, 'conclusion=' + j.conclusion);
    for (const s of j.steps || []) {
      if (s.conclusion === 'failure') {
        console.log('  FAILED step:', s.name);
        const logs = await new Promise((resolve) => {
          https.get({ host: 'api.github.com', path: '/repos/moxingovo/dsh-web-panel/actions/jobs/' + j.id + '/logs', headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-release' } }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          });
        });
        console.log('  --- log tail ---');
        console.log(logs.slice(-3000));
        return;
      }
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
