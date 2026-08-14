# 发布指南 / Release Guide

把 dsh-web-panel 发布到 GitHub（含 .vsix 安装包）的全流程。发布前安全自查：

- 只上传 **dsh-webview 这个文件夹** 里的内容（git 仓库必须建在 dsh-webview 内，不能建在上一级
  ds_harness 目录——上一级有交接文档、npm 缓存等私人文件）。
- 项目内已确认：无 API key、无 token、无邮箱、无机器路径（test/ 已排除在 vsix 之外）。
- 你的 DeepSeek API key 存在 `~/.dsh` 和 GUI 的浏览器存储里，永远不会进入本项目。

## 0. 准备（一次性）

1. 登录 github.com → 右上角 **New repository**：
   - Repository name：`dsh-web-panel`
   - 类型：**Public**
   - **不要**勾选 "Add a README file" / .gitignore / license（我们自带）
   - 点 **Create repository**，复制仓库地址 `https://github.com/moxingovo/dsh-web-panel.git`
     （用户名如果不是 moxingovo 请替换，同时把 package.json 里 repository 的地址一起改掉）
2. （建议）github.com → Settings → Emails → 勾选 "Keep my email addresses private"，
   把 git 邮箱换成页面给的 noreply 邮箱，避免公开仓库里出现你的 QQ 邮箱。

## 1. 上传代码（方式 A：网页拖拽，最简单）

1. 在刚创建的仓库页面点 **uploading an existing file**
2. 把 `dsh-webview` 文件夹里的全部文件拖进去（约 14 个文件：extension.js、package.json、
   README.md、README.zh.md、LICENSE、.gitignore、.vscodeignore、.vscode/、media/、test/）
3. 提交信息填 `v0.2.1: embed DeepSeek Harness in VS Code` → **Commit changes**

## 1. 上传代码（方式 B：Git 命令行，推荐，以后更新方便）

\`\`\`powershell
cd C:\Users\20906\Desktop\ds_harness\dsh-webview
git init
git add .
git commit -m "v0.2.1: embed DeepSeek Harness web GUI in VS Code"
git branch -M main
git remote add origin https://github.com/moxingovo/dsh-web-panel.git
git push -u origin main
\`\`\`

- push 时会自动弹出浏览器让你授权登录 GitHub（Git Credential Manager，Git for Windows 自带）。
- 若弹窗失败：github.com → Settings → Developer settings → Personal access tokens (classic)
  → 生成一个勾选 `repo` 的 token，登录时用户名填 moxingovo、密码粘贴 token。

## 2. 仓库首页设置（让项目好找）

- **About 描述**（点仓库页右侧齿轮）：`Embed DeepSeek Harness (dsh) web GUI in VS Code — zero-config auto-start, workspace follow, self-healing. 在 VS Code 里内嵌 DeepSeek Harness 网页版，零配置自动启动、多工作区跟随、掉线自愈。`
- **Topics**（标签，加 `dsh-plugin` 会被官方生态收录）：`dsh-plugin` `deepseek-harness` `deepseek` `vscode-extension` `vscode` `webview`

## 3. 发布安装包到 Releases

1. 仓库页右侧 **Releases** → **Draft a new release**
2. Tag：`v0.2.1`（点 "Create new tag on publish"）→ Release title：`v0.2.1`
3. 把 `dsh-webview-0.2.1.vsix` 拖到附件区 → **Publish release**
4. 别人安装：下载 vsix → `code --install-extension dsh-webview-0.2.1.vsix`

## 4. （可选）上架 VS Code Marketplace

1. marketplace.visualstudio.com → 用 GitHub 账号登录 → 创建 publisher（如 `moxingovo`）
2. github.com → Settings → Developer settings → PAT，勾选 **Marketplace → Manage**
3. package.json 里 `publisher` 改成你的 publisher ID
4. 打包并发布：

\`\`\`powershell
cd C:\Users\20906\Desktop\ds_harness\dsh-webview
npx @vscode/vsce login moxingovo        # 粘贴 PAT
npx @vscode/vsce publish
\`\`\`

## 更新流程（以后改了代码）

\`\`\`powershell
cd C:\Users\20906\Desktop\ds_harness\dsh-webview
git add .
git commit -m "描述这次改了什么"
git push
# 然后按第 3 步发新版本的 vsix（记得先改 package.json 的 version 并重新 npx @vscode/vsce package）
\`\`\`
