'use strict'
// Headless verification for dsh-webview without a real VS Code window:
// mocks the vscode API surface the extension uses, activates it, and asserts
// the native sidebar provider contract (no iframe, protocol client wired).
// Run: node test/mock-verify.js
const path = require('node:path')

let subscriptions = []
function disposable() { const d = { dispose() {} }; return d }

const commands = {}
const providers = {}

const mockStatusBar = { text: '', tooltip: '', command: '', show() {} }

const config = {
  port: 3080, attachExisting: true, spawnIfMissing: true,
  checkout: process.env.DSH_CHECKOUT ?? '',
  command: '', extraArgs: [], autoOpen: false, followWorkspace: true, stopOnExit: true,
}

// capture the view provider so the test can resolve the sidebar view
let capturedProvider = null
const mockView = {
  webview: {
    options: {},
    html: '',
    postMessage() {},
    onDidReceiveMessage(cb) { mockView._handler = cb; return disposable() },
  },
  onDidDispose() { return disposable() },
}

const vscode = {
  workspace: {
    getConfiguration: () => ({ ...config, get: (k) => config[k] }),
    workspaceFolders: [{ uri: { fsPath: 'C:/Users/20906/Desktop/ds_harness' } }],
    onDidChangeWorkspaceFolders: () => disposable(),
    onDidChangeConfiguration: () => disposable(),
  },
  window: {
    createOutputChannel: () => ({ append: () => {}, appendLine: (l) => console.log('[out]', l), show: () => {}, dispose() {} }),
    createStatusBarItem: () => mockStatusBar,
    showErrorMessage: (m) => console.log('[verify][error-toast]', m),
    showInformationMessage: (m) => console.log('[verify][info-toast]', m),
    registerWebviewViewProvider: (id, provider) => { providers[id] = provider; capturedProvider = provider; return disposable() },
  },
  commands: {
    registerCommand: (id, handler) => { commands[id] = handler; return disposable() },
    executeCommand: async () => undefined,
  },
  env: { openExternal: async () => true, clipboard: { writeText: async () => undefined } },
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

require(path.join(__dirname, '..', 'extension.js')).activate({
  subscriptions: [],
  extensionUri: path.join(__dirname, '..'),
  globalState: { get: async () => null, update: async () => undefined },
})

setTimeout(async () => {
  let failures = 0
  const ok = (name, cond, extra) => {
    console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' — ' + extra : ''))
    if (!cond) failures++
  }
  ok('dshPanel.toggle registered', typeof commands['dshPanel.toggle'] === 'function')
  ok('dshPanel.openBrowser registered', typeof commands['dshPanel.openBrowser'] === 'function')
  ok('dshPanel.reload registered', typeof commands['dshPanel.reload'] === 'function')
  ok('dshPanel.restartServer registered', typeof commands['dshPanel.restartServer'] === 'function')
  ok('old editor command removed', typeof commands['dshWebPanel.open'] === 'undefined')
  ok('sidebar provider registered', !!capturedProvider)
  ok('status bar points to toggle', mockStatusBar.command === 'dshPanel.toggle')

  // resolve the sidebar view and assert the native UI contract (R1: no iframe)
  capturedProvider.resolveWebviewView(mockView)
  ok('webview html set', mockView.webview.html.length > 1000)
  ok('R1 no iframe', !mockView.webview.html.includes('<iframe'))
  ok('native UI marker present', mockView.webview.html.includes('dsh-root') || mockView.webview.html.includes('DSH 原生侧边栏'))
  ok('CSP nonce script', mockView.webview.html.includes('script-src') && mockView.webview.html.includes('nonce-'))
  ok('app js inlined', mockView.webview.html.includes('acquireVsCodeApi'))
  ok('webview protocol bridge handler wired', typeof mockView._handler === 'function')

  console.log(failures === 0 ? '[verify] ALL PASS' : '[verify] FAIL count=' + failures)
  process.exit(failures === 0 ? 0 : 1)
}, 800)
