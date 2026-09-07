'use strict';
const fs = require('fs');
const https = require('node:https');
const zlib = require('node:zlib');
const token = fs.readFileSync(process.env.TEMP + '\\dsh-token.txt', 'utf8').trim();
function get(url, depth) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ host: u.hostname, path: u.pathname + u.search, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'dsh-release' } }, (res) => {
      if ([301, 302].includes(res.statusCode) && depth < 3) { res.resume(); resolve(get(res.headers.location, depth + 1)); return }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}
function unzip(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length - 4) {
    const sig = buf.readUInt32LE(i);
    if (sig !== 0x04034b50) { i++; continue }
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const dataStart = i + 30 + nameLen + extraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    let content;
    try { content = method === 8 ? zlib.inflateRawSync(raw) : raw } catch { content = raw }
    out.push({ name, content: content.toString('utf8') });
    i = dataStart + compSize;
  }
  return out;
}
(async () => {
  const runs = JSON.parse((await get('https://api.github.com/repos/moxingovo/dsh-web-panel/actions/runs?per_page=1')).toString());
  const run = runs.workflow_runs[0];
  const jobs = JSON.parse((await get('https://api.github.com/repos/moxingovo/dsh-web-panel/actions/runs/' + run.id + '/jobs')).toString());
  const job = (jobs.jobs || [])[0];
  const zip = await get('https://api.github.com/repos/moxingovo/dsh-web-panel/actions/jobs/' + job.id + '/logs');
  const entries = unzip(zip);
  console.log('entries=' + entries.length + ' zipLen=' + zip.length);
  for (const e of entries) console.log('  - ' + e.name + ' (' + e.content.length + ')');
  entries.sort((a, b) => b.content.length - a.content.length);
  const biggest = entries[0];
  if (biggest) { console.log('\n### tail of ' + biggest.name + ' ###'); console.log(biggest.content.slice(-3500)) }
})().catch((e) => { console.error('ERR', e.message); process.exit(1) });
