# 发布指南 / Release Guide

打标签即自动发布:`.github/workflows/release.yml` 会跑测试、打包 VSIX(含
`test/fix-vsix.ps1` 编码修复)、从 CHANGELOG 抽取发布说明并创建 GitHub
Release。

> 安全自查提醒:仓库内无 API key、无 token、无邮箱、无机器路径;test/ 已通过
> .vscodeignore 排除在 vsix 之外。DeepSeek API key 存在 `~/.dsh` 与 GUI
> 浏览器存储中,永远不会进入本项目。

## 发版流程(每次)

```powershell
# 1. 改代码后验证
node --check extension.js
node --check webview/app.js
node test/mock-verify.js
node test/ui-smoke.js
# 可选:node test/protocol-smoke.js / node test/bridge-e2e.js(需 3080 服务在跑)

# 2. 升版本(三处同步)
#    package.json 的 "version"
#    extension.js 里 hello 消息的 version
#    webview/app.js 面板标题 brand-ver
#    并在 CHANGELOG.md 顶部加 "## x.y.z" 小节(CI 用它生成 Release 说明)

# 3. 本地试打包(可选,Windows 必跑修复脚本)
npx @vscode/vsce package
pwsh -File test\fix-vsix.ps1 -Version x.y.z

# 4. 推送 + 打 tag(打 tag 即触发 CI 自动构建与 Release)
git add -A
git commit -m "release: vx.y.z …"
git push
git tag vx.y.z
git push origin vx.y.z
```

CI 会自动:测试 → 打包 → 修编码 → 建 Release 并挂 `dsh-webview-x.y.z.vsix`。
CHANGELOG 里没有对应 `## x.y.z` 小节时 CI 会失败——先写小节再打 tag。

## 可选:上架 VS Code Marketplace

想让用户在扩展商店里搜到才需要(需要微软 Marketplace 账号 + PAT):

1. marketplace.visualstudio.com 用 GitHub 账号登录 → 创建 publisher
2. GitHub → Settings → Developer settings → PAT,勾选 **Marketplace: Manage**
3. package.json 的 `publisher` 从 `local-dsh` 改成你的 publisher ID
4. 发布:`npx @vscode/vsce login <publisher>`(粘贴 PAT)→ `npx @vscode/vsce publish`

上架后可保留 GitHub Release 作为备用渠道。
