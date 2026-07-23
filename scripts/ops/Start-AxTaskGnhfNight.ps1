[CmdletBinding()]
param(
    [ValidatePattern('^deepseek/[^\s/]+$')][string]$Model = "deepseek/deepseek-v4-pro",
    [ValidateRange(1, 10)][int]$MaxIterations = 8,
    [ValidateRange(50000, 1500000)][int]$MaxTokens = 800000,
    [ValidateRange(5, 180)][int]$ProbeTimeoutSeconds = 30,
    [switch]$RepairControlPlane
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "PowerShell 7 is required."
}

$RepoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
    throw "AxTask repository directory not found: $RepoPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $RepoPath ".git"))) {
    throw "AxTask Git checkout not found: $RepoPath"
}

# Directory first: no Git, installation, provider, or GNHF logic runs before this point.
Set-Location -LiteralPath $RepoPath

$inside = (& git rev-parse --is-inside-work-tree 2>&1 | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or $inside -ne "true") {
    throw "AxTask path is not a Git worktree: $RepoPath"
}
$dirty = @(git status --porcelain=v1)
if (@($dirty | Where-Object { $_ }).Count -gt 0) {
    throw "AxTask must be clean before an isolated GNHF launch.`n$($dirty -join [Environment]::NewLine)"
}
$branch = (git branch --show-current).Trim()
if (-not $branch) {
    throw "Detached HEAD is not allowed."
}
if ($branch -eq "main" -or $branch.StartsWith("gnhf/")) {
    throw "Launch from a clean non-main, non-GNHF AxTask branch. Current branch: $branch"
}

$PromptPath = Join-Path $RepoPath "docs\ops\gnhf\axtask-night-sprint.md"
if (-not (Test-Path -LiteralPath $PromptPath -PathType Leaf)) {
    throw "AxTask GNHF runtime objective not found: $PromptPath"
}

$InstallRoot = Join-Path $env:LOCALAPPDATA "AgentSwitchboard\GnhfFleet"
$Launcher = Join-Path $InstallRoot "Start-ProviderRoutedGnhfSprint.ps1"
$AgentSwitchboardRepo = Join-Path (Join-Path $HOME "Desktop\dev") "AgentSwitchboard"
$RepairScript = Join-Path $AgentSwitchboardRepo "tooling\gnhf\Install-ProviderRoutedGnhf.ps1"

if ($RepairControlPlane -or -not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $RepairScript -PathType Leaf)) {
        throw "Provider-routed AgentSwitchboard repair script not found: $RepairScript. Pull current AgentSwitchboard main first."
    }

    Write-Host "`n=== Repairing AgentSwitchboard provider route ===" -ForegroundColor Cyan
    & pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File $RepairScript -Apply
    if ($LASTEXITCODE -ne 0) {
        throw "AgentSwitchboard provider-route repair failed."
    }
}

if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
    throw "Installed AgentSwitchboard provider launcher not found: $Launcher"
}

$StopWhen = "One non-colliding AxTask root cause is repaired with deterministic enforcement and docs/ops/gnhf/AXTASK_NIGHT_REPORT.md in a commit ahead of the base, or an exact blocker report is committed; the generated worktree is clean."
$Name = "axtask-deepseek-night-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss")

Write-Host "`n=== AxTask provider-routed GNHF launch ===" -ForegroundColor Cyan
Write-Host "Repository: $RepoPath"
Write-Host "Branch:     $branch"
Write-Host "Model:      $Model"
Write-Host "Prompt:     $PromptPath"
Write-Host "Iterations: $MaxIterations"
Write-Host "Token cap:  $MaxTokens"
Write-Host "Push:       disabled"

& pwsh `
    -NoLogo `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $Launcher `
    -RepoPath $RepoPath `
    -PromptPath $PromptPath `
    -Name $Name `
    -Model $Model `
    -MaxIterations $MaxIterations `
    -MaxTokens $MaxTokens `
    -ProbeTimeoutSeconds $ProbeTimeoutSeconds `
    -StopWhen $StopWhen

$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "AxTask provider-routed GNHF launch failed with exit code $exitCode. Review AgentSwitchboard provider-route evidence under '$InstallRoot\logs\provider-routes'."
}
