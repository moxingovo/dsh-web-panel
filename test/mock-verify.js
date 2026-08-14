'use strict'
// Headless verification for dsh-webview without a real VS Code window:
// mocks the vscode API surface the extension uses, activates it, and asserts
// the attach-to-3080 path plus panel creation. Run: node test/mock-verify.js
const path = require('node:path')

let panelCount = 0
const subscriptions = []
const disposables = new Set()
function disposable() { const d = { dispose() { disposables.delete(this) } }; disposables.add(d); return d }

function makeDisposable(obj) {
  obj.dispose = function () { disposables.delete(obj) }
  disposables.add(obj)
  return obj
}

const mockStatusBar = makeDisposable({ text: '', tooltip: '', command: '', show() {} })

const mockWebview = {
  html: '',
  options: {},
  postMessage(m) { console.log('[verify] webview postMessage:', JSON.stringify(m)) },
}
const mockPanel = makeDisposable({
  webview: mockWebview,
  iconPath: null,
  reveal() { console.log('[verify] panel.reveal()') },
  onDidDispose(cb) { this._cb = cb },
})

const config = {
  port: 3080, attachExisting: true, spawnIfMissing: true,
  checkout: process.env.DSH_CHECKOUT ?? '',
  command: '', extraArgs: [], autoOpen: false, followWorkspace: true, stopOnExit: true,
}

const commands = {}
const vscode = {
  workspace: {
    getConfiguration: () => ({ ...config, get: (k) => config[k] }),
    workspaceFolders: [{ uri: { fsPath: '/workspace/example-project' } }],
    onDidChangeWorkspaceFolders: () => disposable(),
    onDidChangeConfiguration: () => disposable(),
  },
  window: {
    createOutputChannel: () => ({ append: () => {}, appendLine: (l) => console.log('[out]', l), show: () => {}, dispose() {} }),
    createStatusBarItem: () => mockStatusBar,
    showErrorMessage: (m) => console.log('[verify][error-toast]', m),
    showInformationMessage: (m) => console.log('[verify][info-toast]', m),
    createWebviewPanel: () => { panelCount++; return mockPanel },
    registerWebviewViewProvider: () => disposable(),
    registerWebviewPanelSerializer: () => disposable(),
  },
  commands: {
    registerCommand: (id, handler) => { commands[id] = handler; return disposable() },
  },
  env: { openExternal: async () => true },
  Uri: { joinPath: (...p) => path.join(...p), parse: (s) => s },
  StatusBarAlignment: { Left: 1 },
  ViewColumn: { One: 1 },
}

// Intercept require('vscode') before loading the extension.
const Module = require('node:module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscode
  return origLoad.apply(this, arguments)
}

require(path.join(__dirname, '..', 'extension.js')).activate({
  subscriptions: [],
  extensionUri: path.join(__dirname, '..'),
})

setTimeout(async () => {
  console.log('statusBar.text =', mockStatusBar.text)
  console.log('statusBar.tooltip =', mockStatusBar.tooltip)
  // The lazy startup probe should have attached to the live dsh on 3080.
  const attached = mockStatusBar.text.includes('$(plug)')
  console.log('[verify] attached to 3080:', attached)
  // Open the panel through the registered command and check the iframe target.
  await commands['dshWebPanel.open']()
  console.log('[verify] panel created:', panelCount === 1)
  const html = mockWebview.html
  console.log('[verify] iframe targets 3080:', html.includes('http://127.0.0.1:3080/'))
  console.log('[verify] reload handler wired:', html.includes('command==="reload"'))
  const ok = attached && panelCount === 1 && html.includes('http://127.0.0.1:3080/') && html.includes('command==="reload"')
  console.log(ok ? '[verify] ALL PASS' : '[verify] FAIL')
  process.exit(ok ? 0 : 1)
}, 4000)
