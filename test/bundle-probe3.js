'use strict';
// Find who renders aux container icons in the title bar.
const fs = require('fs');
const p = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/out/vs/workbench/workbench.desktop.main.js';
const s = fs.readFileSync(p, 'utf8');
function dump(pat, label, ctx = 900, max = 3) {
  let idx = 0, count = 0;
  const re = new RegExp(pat, 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    count++;
    if (count <= max) {
      console.log('\n=== ' + label + ' #' + count + ' @' + m.index + ' ===');
      console.log(s.slice(Math.max(0, m.index - ctx), m.index + ctx));
    }
  }
  console.log('>>> ' + label + ' total=' + count);
}
dump(/workbench\.parts\.titlebar/g, 'parts.titlebar', 700, 2);
dump(/\.getVisiblePaneCompositeIds\(\)/g, 'call:getVisiblePaneCompositeIds', 900, 4);
dump(/getVisiblePaneCompositeIds\(\)\s*\{/g, 'def:getVisiblePaneCompositeIds', 500, 2);
dump(/activepanelid/g, 'activepanelid', 500, 4);
