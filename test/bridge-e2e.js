'use strict'
// Bridge e2e: mock vscode + activate extension + resolve view against REAL 3080.
// Captures outbound postMessages and asserts sessionList/workspace.
const path = require('node:path')
const repoRoot = path.join(__dirname, '..')
const received = []
function disposable() { return { dispose() {} } }
const commands = {}
const mockStatusBar = { text: '', tooltip: '', command: '', show() {} }
const config = { port: 3080, attachExisting: true, spawnIfMissing: true, checkout: '', command: '', extraArgs: [], autoOpen: false, followWorkspace: true, stopOnExit: true }
let capturedProvider = null
const mockView = { webview: { options: {}, html: '', postMessage(m) { received.push(m) }, onDidReceiveMessage(cb) { mockView._handler = cb; return disposable() } }, onDidDispose() { return disposable() } }
const vscode = {
  workspace: {
    getConfiguration: () => ({ ...config, get: (k) => config[k] }),
    workspaceFolders: [{ uri: { fsPath: 'C:\\Users\\20906\\Desktop\\java' } }],
    onDidChangeWorkspaceFolders: () => disposable(),
    onDidChangeConfiguration: () => disposable(),
  },
  window: {
    createOutputChannel: () => ({ append: () => {}, appendLine: (l) => console.log('[ext]', l), show: () => {}, dispose() {} }),
    createStatusBarItem: () => mockStatusBar,
    showErrorMessage: (m) => console.log('[err]', m),
    showInformationMessage: (m) => console.log('[info]', m),
    registerWebviewViewProvider: (id, p) => { capturedProvider = p; return disposable() },
    registerWebviewPanelSerializer: () => disposable(),
  },
  commands: { registerCommand: (id, h) => { commands[id] = h; return disposable() }, executeCommand: async () => undefined },
  env: { openExternal: async () => true, clipboard: { writeText: async () => undefined } },
  Uri: { joinPath: (u, ...seg) => ({ fsPath: path.join(typeof u === 'string' ? u : u.fsPath, ...seg) }), parse: (s) => s },
  StatusBarAlignment: { Left: 1 },
  ViewColumn: { One: 1 },
}
const Module = require('node:module')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscode
  return origLoad.apply(this, arguments)
}
require(path.join(repoRoot, 'extension.js')).activate({ subscriptions: [], extensionUri: { fsPath: repoRoot }, globalState: { get: async () => null, update: async () => undefined } })
setTimeout(() => {
  capturedProvider.resolveWebviewView(mockView)
  // boot sequence in webview: post boot/listSessions/lastSession
  mockView._handler({ type: 'boot' })
  mockView._handler({ type: 'listSessions' })
  mockView._handler({ type: 'lastSession' })
}, 300)
setTimeout(() => {
  let failures = 0
  const ok = (name, cond, extra) => { console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' — ' + extra : '')); if (!cond) failures++ }
  const byType = (t) => received.filter((m) => m.type === t)
  const ws = byType('workspace').pop()
  const list = byType('sessionList').pop()
  const conn = byType('connection').pop()
  const desc = byType('describe').pop()
  ok('workspace pushed', !!ws && String(ws.path).toLowerCase().includes('java'), JSON.stringify(ws))
  ok('connection became connected', conn && conn.state === 'connected')
  ok('describe arrived', !!desc && !!desc.describe && !!desc.describe.version, desc && desc.describe && desc.describe.version)
  ok('sessionList arrived', !!list && Array.isArray(list.items), list ? 'items=' + list.items.length : 'none')
  const norm = (p) => p ? String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : p
  const javaCount = list ? list.items.filter((s) => norm(s.cwd) === norm('C:\\Users\\20906\\Desktop\\java')).length : 0
  ok('java workspace sessions present', javaCount >= 1, 'java count=' + javaCount)
  process.exit(failures === 0 ? 0 : 1)
}, 6000)
