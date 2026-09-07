'use strict';
// Extract CC's component inventory: distinct class-name prefixes (semantic part before the hash).
const fs = require('fs');
const css = fs.readFileSync('C:/Users/20906/.vscode/extensions/anthropic.claude-code-2.1.263-win32-x64/webview/index.css', 'utf8');
const re = /\.([A-Za-z][A-Za-z0-9]*)_[A-Za-z0-9_-]{4,8}(?=[,{.:\s\[])|\.[A-Za-z][A-Za-z0-9]*(?=[{,\s:.])(?!\.)/g;
const names = new Set();
let m;
while ((m = re.exec(css)) !== null) {
  const n = m[1] || m[0].slice(1);
  if (/^[a-zA-Z][a-zA-Z0-9]+$/.test(n) && n.length > 2) names.add(n);
}
console.log([...names].sort().join(' '));
