'use strict'
// End-to-end check of the spawn path: activates with attachExisting=false and
// a command override that runs the fake dsh server; asserts the manager spawns
// it, probes it, and reaches the ready state. Run: node test/spawn-verify.js
const path = require('node:path')

const mockStatusBar = { text: '', tooltip: '', command: '', show() {} }
const config = {
  port: 3199, attachExisting: false, spawnIfMissing: true,
  checkout: '', command: 'node ' + path.join(__dirname, 'fake-dsh.js'),
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
    showInformationMessage: (m) => console.log('[info-toast]', m),
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

// The extension spawns on demand when the panel opens — trigger it like the
// auto-open / command paths do.
setTimeout(() => {
  commands['dshWebPanel.open']().catch((e) => console.log('[spawn-verify] open failed:', e.message))
}, 500)

setTimeout(() => {
  console.log('statusBar.text =', mockStatusBar.text)
  console.log('statusBar.tooltip =', mockStatusBar.tooltip)
  const ready = mockStatusBar.text.includes('$(check)')
  console.log('[spawn-verify] reached ready via spawned launcher:', ready)
  ext.deactivate()
  process.exit(ready ? 0 : 1)
}, 10000)
