# DSH Web Panel

**English** | [简体中文](README.zh-CN.md)

A **Claude Code-style native sidebar** for using [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) inside VS Code. No web-page clone, no iframe, no second gateway: the extension reuses your existing dsh web service (default `127.0.0.1:3080`) and `~/.dsh`, talking to the service protocol (`POST /api/*` RPC + dual WebSocket downlinks) with a self-written native front-end.

> Community build `0.4.0`. Protocol baseline: deepseek-harness `0.1.0-rc.5` (see [docs/protocol.md](docs/protocol.md)).

## Features

- **Native VS Code workbench**: everything lives in the right auxiliary sidebar, Claude Code-style; no iframe, no embedded WebUI.
- **Multiple entries**: top-right title-bar icon (`editor/title` + titleBar mode), persistent activity-bar icon (one click summons the right panel), `Ctrl+Alt+D`, status-bar DSH.
- **Workspace-synced sessions**: lists only the current workspace's sessions (path-normalized); new sessions are created with `workspaceId` so they land in the harness workspace, never "ungrouped".
- **Harness bottom bar port**:
  - sandbox-permission pill (`/permission` — read-only / workspace-write / full access; projection-driven, live two-way sync with the web UI);
  - model / reasoning-effort pills (custom pill menus, 2 s cross-client sync poll, instant menu open);
  - agent-preset pill (switchable while blank, locked once started per server constraint);
  - 14px context-occupancy ring (harness-style) with percent + `~tokens / window` + system/tools/messages breakdown panel;
  - single send/stop button: idle = send, running = stop, Enter while running = steer-insert.
- **Streaming chat**: Markdown (code copy), reasoning blocks, tool/approval/todo cards, image attachments (vision), `/compact`, silent slash-command execution.
- **Reliability**: events are de-duplicated by seq (no duplicate/empty bubbles); history fold records the watermark so live frames never re-apply.
- **Session management**: archive, rename, fork, live context usage; titles follow server projections.
- **Full Chinese UI + 100% VS Code theme variables**, dark/light adaptive.

## Layout

```
┌────────────────────────────────────┐
│ ✳ DSH v0.4.0        ☰ ＋ ⚙ »      │ ← header (sessions drawer / new / settings / collapse)
├────────────────────────────────────┤
│ messages (streaming / welcome)     │
├────────────────────────────────────┤
│ ┌─ rounded input card ───────────┐ │
│ │ [input, Enter to send]         │ │
│ │ perm model effort preset …(ring)↑ │ ← harness-style in-card footer
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

## Install

1. Download `dsh-webview-x.y.z.vsix` from [Releases](https://github.com/moxingovo/dsh-web-panel/releases).
2. Open the Extensions panel (`Cmd/Ctrl+Shift+X`).
3. Click `...` → **Install from VSIX...** and select the file.
4. Reload the VS Code window.

## Quick start

1. Start DeepSeek Harness (desktop app or `dsh web --port 3080`) — optional; the extension can spawn one.
2. Open your project folder.
3. Click the top-right **DSH icon** (or the activity-bar icon / `Ctrl+Alt+D`).
4. Pick a workspace session via ☰, or create one with ＋; type your task and send.

Zero config: the extension probes port 3080, attaches if an instance responds (sharing all your desktop Harness sessions), otherwise starts one (`dshWeb.command` → `dshWeb.checkout` → `dsh` on PATH → `npx @deepseek-ai/dsh`).

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `dshWeb.port` | `3080` | Port to attach to / start on |
| `dshWeb.attachExisting` | `true` | Reuse a running instance (share its sessions) |
| `dshWeb.spawnIfMissing` | `true` | Start one when none responds |
| `dshWeb.checkout` | "" | Optional checkout path (launches `apps/cli/lib/bin.js`) |
| `dshWeb.command` | "" | Full command override, e.g. `pnpm dsh` |
| `dshWeb.extraArgs` | `[]` | Extra args, e.g. `--trusted-host` |
| `dshWeb.followWorkspace` | `true` | Restart a self-started server when the first folder changes |
| `dshWeb.stopOnExit` | `true` | Stop a self-started server on VS Code exit |

Logs: **Output → DSH**.

## Commands

| Command | Meaning |
|---|---|
| `DSH: 展开/收起侧边栏` | Open/focus the right panel (`Ctrl+Alt+D`) |
| `DSH: 打开对话面板` | Title-bar / editor-title icon entry |
| `DSH: 在浏览器中打开` | Open the dsh web UI |
| `DSH: 重载侧边栏` | Reload the panel and reconnect |
| `DSH: 重启服务` | Restart a self-started server |

## Troubleshooting

Two known environment issues, fixed by one click (`fix-dsh.cmd` on the Desktop, or `test/fix-cache.js` + `test/fix-state.js`; run with VS Code **fully exited**):

1. **Extension marked "broken" / icon never shows**: VS Code's extension scan cache (`.vscode/extensions/extensions.json`) still references a deleted old-version folder, so the new version is never discovered.
2. **Chat tab keeps coming back / top-right icon missing**: auxiliary-bar container icons live in global storage `workbench.auxiliarybar.pinnedPanels`; per-workspace patches are ineffective and edits made while VS Code runs get overwritten on exit.

## Security & privacy

- Connects only to the loopback dsh web service on `127.0.0.1`; proxies nothing.
- Strict webview CSP (no remote scripts, no iframes); the self-written Markdown renderer disallows raw HTML by default.
- API keys stay in your `~/.dsh`; the extension never reads or forwards them. `DSH_HOME` is pinned to `~/.dsh` — never isolated.
- File/command access is governed solely by the Harness server's own sandbox permissions and approval policy.

## Platform support

Pure-JS extension (no native binaries): one VSIX for Windows / macOS / Linux. Tested on Windows + VS Code 1.136.

## Development & packaging

```sh
node test/mock-verify.js      # mock vscode API contract checks
node test/ui-smoke.js         # jsdom panel rendering (24 checks)
node test/protocol-smoke.js   # end-to-end against a real service
node test/bridge-e2e.js       # full bridge chain (mock vscode + real 3080)
npx @vscode/vsce package
pwsh -File test\fix-vsix.ps1 -Version 0.4.0  # repairs vsce's UTF-8 mangling (Windows)
```

Protocol mapping: [docs/protocol.md](docs/protocol.md).

## License

MIT — see [LICENSE](LICENSE). DeepSeek Harness belongs to its respective owners; this extension is not affiliated with DeepSeek.
