$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$startCmdPath = Join-Path $projectRoot "start-offline.cmd"

if (-not (Test-Path $startCmdPath)) {
  Write-Error "start-offline.cmd not found at $startCmdPath"
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Start AxTask Offline.lnk"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $startCmdPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$shortcut.Description = "Start AxTask in one-click offline mode"
$shortcut.Save()

Write-Host "Created desktop shortcut:"
Write-Host "  $shortcutPath"
