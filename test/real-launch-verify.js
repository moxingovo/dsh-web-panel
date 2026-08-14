'use strict'
// Real-launch proof: spawns the actual dsh web server from the checkout via the
// extension's launch chain (same as official "dsh web --port N").
const path = require('node:path')
const mockStatusBar = { text: '', tooltip: '', command: '', show() {} }
// Set DSH_CHECKOUT to a local checkout to test the checkout launcher;
// leave it unset to exercise the auto-detect chain (dsh CLI → npx).
const config = {
  port: 3198, attachExisting: false, spawnIfMissing: true,
  checkout: process.env.DSH_CHECKOUT ?? '', command: '',
  extraArgs: [], autoOpen: false, followWorkspace: true, stopOnExit: true,
}
const commands = {}
const vscode = {
  workspace: {
    getConfiguration: () => ({ ...config, get: (k) => config[k] }),
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
  window: {
    createOutputChannel: () => ({ append: () => {}, appendLine: (l) => console.log('[out]', l), show() {}, dispose() {} }),
    createStatusBarItem: () => mockStatusBar,
    showErrorMessage: (m) => console.log('[err-toast]', m),
    showInformationMessage: () => {},
    createWebviewPanel: () => ({ webview: { html: '' }, iconPath: null, reveal() {}, onDidDispose() {} }),
    registerWebviewViewProvider: () => ({ dispose() {} }),
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
  },
  commands: { registerCommand: (id, h) => { commands[id] = h; return { dispose() {} } } },
  env: { openExternal: async () => true },
  Uri: { joinPath: (...p) => path.join(...p), parse: (s) => s },
  StatusBarAlignment: { Left: 1 },
  ViewColumn: { One: 1 },
}
const Module = require('node:module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscode
  return origLoad.apply(this, arguments)
}
const ext = require(path.join(__dirname, '..', 'extension.js'))
ext.activate({ subscriptions: [], extensionUri: path.join(__dirname, '..') })
setTimeout(() => {
  commands['dshWebPanel.open']().catch((e) => console.log('[real] open failed:', e.message))
}, 500)
setTimeout(() => {
  console.log('statusBar.text =', mockStatusBar.text)
  const ready = mockStatusBar.text.includes('$(check)')
  console.log('[real-launch] extension spawned the real dsh server and reached ready:', ready)
  ext.deactivate()
  process.exit(ready ? 0 : 1)
}, 25000)
