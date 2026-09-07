'use strict';
// Read-only probe: extract context around aux-bar related strings in the VS Code workbench bundle.
const fs = require('fs');
const p = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/out/vs/workbench/workbench.desktop.main.js';
const s = fs.readFileSync(p, 'utf8');
console.log('len', s.length);
const pats = [
  'viewContainersWorkspaceState',
  'workbench.auxiliarybar.',
  'workbench.parts.auxiliarybar',
  'secondarySidebar'
];
for (const pat of pats) {
  let idx = 0, count = 0;
  while ((idx = s.indexOf(pat, idx)) !== -1) {
    count++;
    if (count <= 2) {
      console.log('\n=== ' + pat + ' #' + count + ' @' + idx + ' ===');
      console.log(s.slice(Math.max(0, idx - 400), idx + 700));
    }
    idx += pat.length;
  }
  console.log('>>> ' + pat + ' total=' + count);
}
