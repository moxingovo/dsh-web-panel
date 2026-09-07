'use strict';
// Extract CC's layout component rules from its minified CSS.
const fs = require('fs');
const css = fs.readFileSync('C:/Users/20906/.vscode/extensions/anthropic.claude-code-2.1.263-win32-x64/webview/index.css', 'utf8');
// split into rules by braces (approximate; minified CSS has no nested braces in declarations)
const rules = [];
let depth = 0, cur = '';
for (const ch of css) {
  cur += ch;
  if (ch === '{') { depth++; if (depth === 1) cur = cur.trim() }
  if (ch === '}') {
    depth--;
    if (depth === 0) { rules.push(cur.trim()); cur = '' }
  }
}
const wanted = /welcome|empty|input|composer|prompt|send|header|titlebar|session|chat-list|conversation|model-selector|attachment|pill|suggest/i;
const out = [];
for (const r of rules) {
  const i = r.indexOf('{');
  if (i < 0) continue;
  const sel = r.slice(0, i);
  if (wanted.test(sel)) {
    // keep only short, meaningful rules
    const body = r.slice(i + 1, -1).trim();
    if (body.length < 500) out.push(sel + ' { ' + body + ' }');
  }
}
console.log('total matched rules:', out.length);
for (const o of out.slice(0, 120)) console.log('\n' + o);
