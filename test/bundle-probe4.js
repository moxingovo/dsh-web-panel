'use strict';
// How are container icons rendered (img vs css mask)? Where does the aux icon strip live?
const fs = require('fs');
const p = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/out/vs/workbench/workbench.desktop.main.js';
const s = fs.readFileSync(p, 'utf8');
function dump(re, label, ctx = 700, max = 3) {
  let m, count = 0;
  const rg = new RegExp(re, 'g');
  while ((m = rg.exec(s)) !== null) {
    count++;
    if (count <= max) {
      console.log('\n=== ' + label + ' #' + count + ' @' + m.index + ' ===');
      console.log(s.slice(Math.max(0, m.index - ctx), m.index + ctx));
    }
  }
  console.log('>>> ' + label + ' total=' + count);
}
dump(/paneCompositeBar/g, 'paneCompositeBar', 800, 6);
dump(/iconUrl/g, 'iconUrl', 450, 4);
dump(/mask-image/g, 'mask-image', 350, 3);
