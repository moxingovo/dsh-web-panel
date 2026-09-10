'use strict';
// Reproduce: pill menus should open repeatedly; switching twice must work.
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const jsdom = require(path.join(__dirname, 'ui-smoke', 'node_modules', 'jsdom'));

function makeWindow() {
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  dom.virtualConsole.on('jsdomError', (e) => { console.log('JSDOM-ERR:', e && (e.detail ? e.detail.message : e.message)); if (e && e.detail && e.detail.stack) console.log(String(e.detail.stack).split('\n').slice(0, 4).join('\n')) });
  const posted = [];
  win.__posted = posted;
  win.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m) });
  win.eval(fs.readFileSync(path.join(repo, 'webview', 'markdown.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(repo, 'webview', 'app.js'), 'utf8'));
  return { dom, win };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { dom, win } = makeWindow();
  const $ = (sel) => win.document.querySelector(sel);
  const $$ = (sel) => [...win.document.querySelectorAll(sel)];
  // host -> webview: dispatch a window message event (as VS Code does)
  const post = (m) => { win.dispatchEvent(new win.MessageEvent('message', { data: m })) };

  // boot
  post({ type: 'hello', port: 3080, version: '0.3.5' });
  post({ type: 'workspace', path: 'C:/Users/20906/Desktop/ds_harness' });
  post({ type: 'describe', describe: { version: '0.0.1', provider: 'deepseek-official', model: 'deepseek-v4-pro' }, config: {} });
  post({ type: 'connection', state: 'connected' });
  post({ type: 'sessionList', items: [{ sessionId: 's1', cwd: 'C:/Users/20906/Desktop/ds_harness', agentPreset: 'code' }], archivedIds: [], workspacePath: 'C:/Users/20906/Desktop/ds_harness' });
  post({
    type: 'sessionOpened', sessionId: 's1', events: [], projections: null, hasMore: false, blank: true,
    models: { current: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' }, groups: [{ id: 'deepseek-official', models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] } }, { id: 'deepseek-flash', name: 'DeepSeek-Flash', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'max', name: 'Max' }] } }] }] },
    presets: { presets: [{ id: 'code', name: 'code', isDefault: true }, { id: 'standard', name: 'standard' }] },
  });
  await sleep(50);

  const pill = $('#modelPill');
  console.log('modelPill label:', pill.textContent, 'disabled=', pill.disabled);

  // first open
  pill.dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('1st click -> menu count:', $$('.pill-menu').length, 'items:', $$('.pill-menu .pill-item').length);

  // pick second model (Flash)
  $$('.pill-menu .pill-item')[1].dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('after pick -> menu count:', $$('.pill-menu').length);
  console.log('label now:', pill.textContent);
  const sel1 = win.__posted.filter((m) => m.type === 'selectModel');
  console.log('selectModel posts:', sel1.length);

  // second open
  pill.dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('2nd click -> menu count:', $$('.pill-menu').length, 'items:', $$('.pill-menu .pill-item').length);

  // pick third option in second menu (index 0)
  const items2 = $$('.pill-menu .pill-item');
  if (items2.length) { items2[0].dispatchEvent(new win.Event('click')); await sleep(20); }
  console.log('after 2nd pick -> menu count:', $$('.pill-menu').length);
  const sel2 = win.__posted.filter((m) => m.type === 'selectModel');
  console.log('selectModel posts:', sel2.length, 'label:', pill.textContent);

  // effort pill twice
  const eff = $('#effortPill');
  console.log('effortPill label:', eff.textContent);
  eff.dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('effort 1st menu items:', $$('.pill-menu .pill-item').length);
  $$('.pill-menu .pill-item')[0].dispatchEvent(new win.Event('click'));
  await sleep(20);
  eff.dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('effort 2nd menu items:', $$('.pill-menu .pill-item').length);

  // perm pill twice
  const perm = $('#permPill');
  perm.dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('perm 1st menu items:', $$('.pill-menu .pill-item').length);
  $$('.pill-menu .pill-item')[1].dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('perm label after pick:', perm.textContent);
  perm.dispatchEvent(new win.Event('click'));
  await sleep(20);
  console.log('perm 2nd menu items:', $$('.pill-menu .pill-item').length);

  win.close();
})().catch((e) => { console.error('REPRO ERROR:', e); process.exit(1) });
