@echo off
chcp 65001 >nul
title DSH 辅助栏清理
echo ============================================
echo  DSH:清除"聊天"标签并固定 DSH 右上角图标
echo --------------------------------------------
tasklist /FI "IMAGENAME eq Code.exe" 2>nul | find /I "Code.exe" >nul
if %errorlevel%==0 (
  echo [警告] 检测到 VS Code 仍在运行!
  echo 请先完全退出 VS Code 所有窗口,再运行本脚本。
  echo 否则 VS Code 退出时会覆盖本次修改。
  pause
  exit /b 1
)
echo [1/1] 正在修补工作区状态(自动备份)...
node "%~dp0patch-aux.js"
echo.
echo 完成!现在可以重新打开 VS Code。
pause
