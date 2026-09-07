# DSH Web Panel

[English](README.md) | **简体中文**

在 VS Code 中以 **Claude Code 风格原生侧边栏**使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 VS Code 扩展。不复刻网页、不内嵌 iframe、不引入第二个 Gateway:扩展复用你本机已有的 dsh web 服务(默认 `127.0.0.1:3080`)与 `~/.dsh`,用自写的原生前端直接与服务端协议(`POST /api/*` RPC + 双 WebSocket 下行)对话。

> 当前为社区开发版本 `0.4.0`。协议基线对齐 deepseek-harness `0.1.0-rc.5`(详见 [docs/protocol.md](docs/protocol.md))。

## 功能

- **原生 VS Code 工作台**:全部交互在右侧辅助栏完成,与 Claude Code 同款入口机制;无 iframe、无 WebUI 内嵌。
- **多重入口**:右上角标题栏图标(`editor/title` + titleBar 模式)、活动栏常驻图标(点击直接拉起右侧面板)、`Ctrl+Alt+D`、状态栏 DSH。
- **会话与 harness 本工作区同步**:列表只显示当前工作区会话(路径大小写/斜杠归一化);新建会话按 `workspaceId` 入组,不会落进"未分组"。
- **harness 底栏移植**:
  - 沙箱权限药丸(`/permission` 三档:只读 / 工作区写入 / 完整访问,投影驱动、与网页端双向实时同步);
  - 模型 / 推理档药丸(自制药丸菜单,2 秒短轮询跨端同步,点击即时打开);
  - 预设药丸(空白会话可切换,会话开始后按服务端约束锁定);
  - 14px 上下文占用环(harness 同款),点击展开百分比 + `~token / 窗口` + 系统/工具/消息三段拆分面板;
  - 发送/停止单按钮:空闲 = 发送,运行中 = 停止,运行中按 Enter = 直接插入对话(steer)。
- **流式对话**:Markdown(代码块一键复制)、推理块、工具卡/审批卡/Todo/时间线、图片附件(vision)、`/compact` 压缩、斜杠命令静默执行。
- **消息可靠性**:事件按 seq 去重,消除重复与空消息气泡;历史折叠记录水位,直播流不再重复应用。
- **会话管理**:归档、重命名、fork、上下文用量实时显示;标题跟随服务端投影自动更新。
- **全中文界面 + 100% VS Code 主题变量**,深浅色主题自适应。

## 界面结构

```
┌────────────────────────────────────┐
│ ✳ DSH v0.4.0        ☰ ＋ ⚙ »      │ ← 顶栏(会话抽屉/新会话/设置/收起)
├────────────────────────────────────┤
│ 消息区(流式回复 / 欢迎页)          │
├────────────────────────────────────┤
│ ┌─ 圆角输入卡片 ─────────────────┐ │
│ │ [输入框,Enter 发送]            │ │
│ │ 权限 模型 推理 预设 压缩 (环) ↑ │ │ ← harness 同款卡内底栏
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

## 安装

1. 从 [Releases](https://github.com/moxingovo/dsh-web-panel/releases) 下载 `dsh-webview-x.y.z.vsix`。
2. 打开 VS Code 扩展面板(`Cmd/Ctrl+Shift+X`)。
3. 点击右上角 `...` → **从 VSIX 安装...**,选择下载的文件。
4. 按提示重新加载 VS Code 窗口。

## 快速开始

1. 启动你的 DeepSeek Harness(桌面应用或 `dsh web --port 3080`);不启动也行,扩展可自动拉起。
2. 打开要工作的项目文件夹。
3. 点击右上角 **DSH 图标**(或活动栏图标 / `Ctrl+Alt+D`)打开右侧面板。
4. 点 ☰ 选一个本工作区会话,或点 ＋ 新建;直接输入任务发送。

无需任何额外配置:扩展探测 3080 端口,已有实例即附着(共享你桌面 Harness 的全部会话),没有则自动启动一个(顺序:`dshWeb.command` → `dshWeb.checkout` → PATH 里的 `dsh` → `npx @deepseek-ai/dsh`)。

## 配置

| 设置 | 默认值 | 说明 |
|---|---|---|
| `dshWeb.port` | `3080` | 附着/启动的端口 |
| `dshWeb.attachExisting` | `true` | 优先复用已运行的实例(共享其会话) |
| `dshWeb.spawnIfMissing` | `true` | 没有实例时自动启动 |
| `dshWeb.checkout` | 空 | 可选:checkout 路径(用其 `apps/cli/lib/bin.js` 启动) |
| `dshWeb.command` | 空 | 整条启动命令覆盖(如 `pnpm dsh`) |
| `dshWeb.extraArgs` | `[]` | 追加参数(如 `--trusted-host`) |
| `dshWeb.followWorkspace` | `true` | 自启服务器跟随工作区首文件夹变化重启 |
| `dshWeb.stopOnExit` | `true` | 退出 VS Code 时停掉本扩展启动的服务器 |

排错看 **Output → DSH**(记录连接与协议流量)。

## 命令

| 命令 | 说明 |
|---|---|
| `DSH: 展开/收起侧边栏` | 打开/聚焦右侧对话面板(快捷键 `Ctrl+Alt+D`) |
| `DSH: 打开对话面板` | 标题栏/编辑器标题图标入口 |
| `DSH: 在浏览器中打开` | 打开 dsh 网页版 |
| `DSH: 重载侧边栏` | 重新加载面板并重连服务 |
| `DSH: 重启服务` | 重启本扩展启动的服务器 |

## 排障

两个已知环境问题的根因与一键修复(桌面 `fix-dsh.cmd`,或仓库 `test/fix-cache.js` + `test/fix-state.js`,需**完全退出 VS Code** 后运行):

1. **扩展显示"损坏" / 图标不出现**:VS Code 扩展扫描缓存(`.vscode/extensions/extensions.json`)残留旧版本目录引用,新版本永不被发现。
2. **"聊天"标签反复出现 / 右上角图标不显示**:辅助栏容器图标存于全局存储 `workbench.auxiliarybar.pinnedPanels`,仅改工作区状态无效,且运行中修改会被退出回写覆盖。

## 安全与隐私

- 只连接 `127.0.0.1` 回环地址上的 dsh web 服务;不代理、不转发任何外部流量。
- Webview 使用严格 CSP(无远程脚本、无 iframe);自写 Markdown 渲染器默认不支持原始 HTML。
- API Key 等凭据始终留在你的 `~/.dsh` 中,扩展不读取、不转发;`DSH_HOME` 强制指向 `~/.dsh`,绝不隔离。
- 文件与命令访问完全由 Harness 服务端自身的沙箱权限(只读/工作区写入/完整访问)与审批策略控制,扩展不额外放宽。

## 平台支持

纯 JS 扩展(无原生二进制),Windows / macOS / Linux 通用同一 VSIX;已在 Windows + VS Code 1.136 实测。

## 开发与打包

```sh
node test/mock-verify.js      # mock vscode API 扩展契约
node test/ui-smoke.js         # jsdom 面板渲染(24 项)
node test/protocol-smoke.js   # 真实服务端到端(建会话/流式/停止/归档)
node test/bridge-e2e.js       # 完整桥接链路(mock vscode + 真 3080)
npx @vscode/vsce package      # 打包
pwsh -File test\fix-vsix.ps1 -Version 0.4.0  # 修复 vsce 中文编码(Windows 必跑)
```

协议映射见 [docs/protocol.md](docs/protocol.md)。

## 许可证

MIT — 见 [LICENSE](LICENSE)。DeepSeek Harness 归其版权方所有,本扩展与 DeepSeek 无关。
