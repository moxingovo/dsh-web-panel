'use strict';
const fs = require('fs');
const s = fs.readFileSync('C:/Users/20906/source/dsh-web-panel/webview/app.js', 'utf8');
const tokens = new Set();
const re = /['"]([a-z][a-z0-9-]*(\s+[a-z][a-z0-9-]*)*)['"]/g;
let m;
while ((m = re.exec(s)) !== null) {
  const t = m[1];
  if (/^[a-z][a-z0-9-]*$/.test(t) && /^(dsh|sb|msg|md|tool|todo|approval|q-|cm|wc|hdr|ctx|act|code|attach|chip|composer|cc-|set|queue|btn|empty|welcome|reasoning|textblock|result|dispatch|load|large|img|icon|brand|send)/.test(t)) {
    tokens.add(t);
  }
}
console.log([...tokens].sort().join('\n'));
