'use strict';
// Find the pinnedViewContainersKey for the auxiliary bar part + snap/titlebar wiring.
const fs = require('fs');
const p = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/out/vs/workbench/workbench.desktop.main.js';
const s = fs.readFileSync(p, 'utf8');
function dump(re, label, ctx = 800, max = 4) {
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
dump(/pinnedViewContainersKey/g, 'pinnedViewContainersKey', 900, 6);
dump(/getCompositeBarOptions\(\)\{/g, 'getCompositeBarOptions', 700, 4);
dump(/\.snap\b/g, 'snap-usage', 700, 6);
