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
  const runs = await get('/repos/moxingovo/dsh-web-panel/actions/runs?per_page=2');
  for (const run of runs.workflow_runs || []) {
    console.log('=== run ' + run.id + ' (' + run.created_at + ') conclusion=' + run.conclusion);
    const jobs = await get('/repos/moxingovo/dsh-web-panel/actions/runs/' + run.id + '/jobs');
    for (const j of jobs.jobs || []) {
      console.log('  job: ' + j.name + ' => ' + j.conclusion);
      for (const s of j.steps || []) {
        console.log('    [' + s.conclusion + '] ' + s.name);
      }
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
