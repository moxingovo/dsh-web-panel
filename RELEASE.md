# 发布指南 / Release Guide

本仓库已发布到 GitHub(含 .vsix 附件)与 VS Code 侧文件分发。下表是**之后每次发版**要走的流程。

> 安全自查提醒:仓库内无 API key、无 token、无邮箱、无机器路径;test/ 已通过 .vscodeignore 排除在 vsix 之外。
> DeepSeek API key 存在 `~/.dsh` 与 GUI 浏览器存储中,永远不会进入本项目。

## 发版流程(每次)

```powershell
# 1. 改代码后先验证
node --check extension.js
node test/mock-verify.js            # headless 检查(attach/panel/iframe/reload)

# 2. 升版本(例如 0.2.2 -> 0.2.3)
npm version patch --no-git-tag-version
# 同步 README.md / README.zh.md 中的 vsix 文件名版本号

# 3. 打包(在仓库根目录执行)
npx @vscode/vsce package            # 生成 dsh-webview-<version>.vsix

# 4. 推送代码 + tag
git add -A
git commit -m "描述这次改了什么"
git push
git tag v0.2.3 && git push origin v0.2.3

# 5. 建 Release(GitHub 网页):Releases → Draft a new release
#    tag 选上面的 v0.2.3;title「DSH Web Panel v0.2.3」;正文用下方模板;把 vsix 拖进 Attach binaries
```

## Release 正文模板

```markdown
# DSH Web Panel v<version>

Embed the DeepSeek Harness web GUI inside VS Code: sidebar view + editor-tab
panel, status-bar indicator, zero-config server launch (attach or auto-start),
workspace follow, and self-healing.

## What's changed (v<version>)

- (逐条列出本次改动)

## Install (from the attached .vsix)

```
code --install-extension dsh-webview-<version>.vsix
```

Requires VS Code >= 1.85 and Node.js. MIT License.
```

## 可选:上架 VS Code Marketplace

想让用户在扩展商店里搜到才需要(需要微软 Marketplace 账号 + PAT):

1. marketplace.visualstudio.com 用 GitHub 账号登录 → 创建 publisher
2. GitHub → Settings → Developer settings → PAT,勾选 **Marketplace: Manage**
3. package.json 的 `publisher` 从 `local-dsh` 改成你的 publisher ID
4. 发布:`npx @vscode/vsce login <publisher>`(粘贴 PAT)→ `npx @vscode/vsce publish`

上架后可保留 GitHub Release 作为备用渠道。
