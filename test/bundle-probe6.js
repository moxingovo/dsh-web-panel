'use strict';
const fs = require('fs');
const p = 'C:/Users/20906/VScode/Microsoft VS Code/a44adf7f53/resources/app/out/vs/workbench/workbench.desktop.main.js';
const s = fs.readFileSync(p, 'utf8');
let idx = 0, count = 0;
while ((idx = s.indexOf('editorActionsLocation', idx)) !== -1) {
  count++;
  if (count <= 6) {
    console.log('\n=== #' + count + ' @' + idx + ' ===');
    console.log(s.slice(Math.max(0, idx - 300), idx + 400));
  }
  idx += 20;
}
console.log('total=', count);
