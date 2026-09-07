'use strict';
// Inject the real harness logo (from media/dsh.svg) into app.js renderEmpty as an inline SVG.
const fs = require('fs');
const svg = fs.readFileSync('C:/Users/20906/source/dsh-web-panel/media/dsh.svg', 'utf8');
const m = / d="([^"]+)"/.exec(svg.replace(/\n/g, ' '));
if (!m) { console.error('path not found in dsh.svg'); process.exit(1) }
const d = m[1];
const appPath = 'C:/Users/20906/source/dsh-web-panel/webview/app.js';
let app = fs.readFileSync(appPath, 'utf8');
const old = "    empty.appendChild(el('div', 'welcome-logo'))";
const ns = "'http://www.w3.org/2000/svg'";
const repl =
  "    const logo = document.createElementNS(" + ns + ", 'svg')\n" +
  "    logo.setAttribute('viewBox', '0 0 24 24')\n" +
  "    logo.setAttribute('class', 'welcome-logo')\n" +
  "    const logoPath = document.createElementNS(" + ns + ", 'path')\n" +
  "    logoPath.setAttribute('transform', 'translate(0.5 0.5) scale(0.46)')\n" +
  "    logoPath.setAttribute('fill', '#4D6BFE')\n" +
  "    logoPath.setAttribute('d', " + JSON.stringify(d) + ")\n" +
  "    logo.appendChild(logoPath)\n" +
  "    empty.appendChild(logo)";
if (!app.includes(old)) { console.error('anchor not found in app.js'); process.exit(1) }
app = app.replace(old, repl);
fs.writeFileSync(appPath, app);
console.log('injected logo path len=' + d.length);
