# Rebuild the .vsix with the CLEAN repo package.json.
# Why: vsce on this machine sometimes mangles UTF-8 Chinese in package.json
# (GBK roundtrip) which can break JSON. This script repacks the vsix from
# the installed-extension files (which are known-good) so the shipped
# artifact is always clean.
# Usage: pwsh -File test\fix-vsix.ps1   (run from the repo root)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$vsix = Join-Path $repo 'dsh-webview-0.3.1.vsix'
$inst = Join-Path $env:USERPROFILE '.vscode\extensions\local-dsh.dsh-webview-0.3.1'
if (-not (Test-Path $vsix)) { throw "vsix not found: $vsix" }
if (-not (Test-Path $inst)) { throw "installed extension not found: $inst" }

$stage = Join-Path $env:TEMP 'dsx-stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item (Join-Path $stage 'orig') -ItemType Directory -Force | Out-Null
New-Item (Join-Path $stage 'rebuild') -ItemType Directory -Force | Out-Null

Copy-Item $vsix (Join-Path $stage 'orig.zip') -Force
Expand-Archive -Path (Join-Path $stage 'orig.zip') -DestinationPath (Join-Path $stage 'orig') -Force
New-Item (Join-Path $stage 'rebuild\extension') -ItemType Directory -Force | Out-Null
Get-ChildItem $inst -Force | Copy-Item -Destination (Join-Path $stage 'rebuild\extension') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $stage 'orig\extension.vsixmanifest') -Destination (Join-Path $stage 'rebuild\extension.vsixmanifest') -Force
Copy-Item -LiteralPath (Join-Path $stage 'orig\[Content_Types].xml') -Destination (Join-Path $stage 'rebuild\[Content_Types].xml') -Force

$out = Join-Path $stage 'rebuild.zip'
Compress-Archive -Path (Join-Path $stage 'rebuild\*') -DestinationPath $out -Force
Move-Item $out $vsix -Force
Remove-Item $stage -Recurse -Force
Write-Output "vsix rebuilt: $vsix"
