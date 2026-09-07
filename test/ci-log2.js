'use strict';
const fs = require('fs');
const https = require('node:https');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
function get(url, depth) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ host: u.hostname, path: u.pathname + u.search, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-release', 'Accept': 'application/vnd.github+json' } }, (res) => {
      if ([301, 302].includes(res.statusCode) && depth < 3) { res.resume(); resolve(get(res.headers.location, depth + 1)); return }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}
(async () => {
  const runs = JSON.parse(await get('https://api.github.com/repos/moxingovo/dsh-web-panel/actions/runs?per_page=1'));
  const run = runs.workflow_runs[0];
  console.log('run ' + run.id + ' sha=' + (run.head_sha || '').slice(0, 7));
  const jobs = JSON.parse(await get('https://api.github.com/repos/moxingovo/dsh-web-panel/actions/runs/' + run.id + '/jobs'));
  const job = (jobs.jobs || [])[0];
  const logs = await get('https://api.github.com/repos/moxingovo/dsh-web-panel/actions/jobs/' + job.id + '/logs');
  const tail = logs.split('\n').slice(-40).join('\n');
  console.log('--- log tail ---');
  console.log(tail);
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
