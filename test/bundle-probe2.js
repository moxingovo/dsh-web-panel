'use strict';
// Scan bundle: find 'titlebar' occurrences whose neighborhood mentions aux/composite.
const fs = require('fs');
const p = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/out/vs/workbench/workbench.desktop.main.js';
const s = fs.readFileSync(p, 'utf8');
console.log('len', s.length);
const hits = [];
let idx = 0;
const re = /titlebar/gi;
let m;
let count = 0;
while ((m = re.exec(s)) !== null) {
  count++;
  const win = s.slice(Math.max(0, m.index - 900), m.index + 900).toLowerCase();
  if (/auxil/.test(win)) {
    hits.push(m.index);
    if (hits.length <= 4) {
      console.log('\n=== titlebar+auxil @' + m.index + ' ===');
      console.log(s.slice(Math.max(0, m.index - 900), m.index + 900));
    }
  }
}
console.log('>>> titlebar total=' + count + ' with-auxil=' + hits.length);
