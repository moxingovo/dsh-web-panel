# DSH aux-bar fix: remove the core chat tab from the auxiliary bar state and
# ensure the DSH container is registered there (top-right icon stays).
# Run while VS Code is FULLY CLOSED. Re-runnable: idempotent.
$ErrorActionPreference = 'Stop'
$storageRoot = "$env:APPDATA\Code\User\workspaceStorage"
$patched = 0
$skipped = 0
Get-ChildItem $storageRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $dbPath = Join-Path $_.FullName 'state.vscdb'
  if (-not (Test-Path $dbPath)) { return }
  $backup = "$dbPath.bak-dsh"
  if (-not (Test-Path $backup)) { Copy-Item $dbPath $backup }
  $db = $null
  try {
    $db = New-Object -ComObject ADODB.Connection
    $db.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$dbPath")
    # read current value
    $rs = $db.Execute("SELECT value FROM ItemTable WHERE key='workbench.auxiliarybar.viewContainersWorkspaceState'")
    $current = ''
    if (-not $rs.EOF) { $current = $rs.Fields('value').Value }
    $rs.Close()
    if ($current -eq '') { $skipped++; return }
    $parsed = $current | ConvertFrom-Json -ErrorAction Stop
    # remove chat panel container; add our DSH aux container once
    $keep = @($parsed | Where-Object { $_.id -ne 'workbench.panel.chat' })
    if ($keep.id -notcontains 'workbench.view.extension.dsh-aux') {
      $keep += [pscustomobject]@{ id = 'workbench.view.extension.dsh-aux'; visible = $true }
    }
    $next = $keep | ConvertTo-Json -Compress
    $db.Execute("UPDATE ItemTable SET value='$($next.Replace("'","''"))' WHERE key='workbench.auxiliarybar.viewContainersWorkspaceState'")
    $patched++
  } catch { Write-Host "skip $($_.Name): $($_.Exception.Message)" } finally {
    if ($db) { try { $db.Close() } catch {} }
  }
}
Write-Host "patched=$patched skipped=$skipped"
