#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Stage all changes, commit, and push the current feature branch to origin (sets upstream).

.DESCRIPTION
  Convenience wrapper for: git add . && git commit -m "..." && git push -u origin <current-branch>
  Run from repo root or any path; the script cds to the repository root.
  Refuses to run on main because main is the production-connected branch and must advance through a reviewed PR/deployment gate.

.EXAMPLE
  ./scripts/ship.ps1 "fix(ui): adjust splitter rail"

.EXAMPLE
  npm run ship -- "fix(ui): adjust splitter rail"

.EXAMPLE
  pwsh -File scripts/ship.ps1 chore: bump cache version
#>
param(
  [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
  [string[]] $MessageParts
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$msg = ($MessageParts -join " ").Trim()
if ([string]::IsNullOrWhiteSpace($msg)) {
  Write-Error "Commit message is required. Example: ./scripts/ship.ps1 `"fix(ui): description`""
  exit 1
}

$branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
  Write-Error "Could not determine current branch."
  exit 1
}

if ($branch -eq "main") {
  Write-Error "Refusing to run npm run ship on main. Use a feature branch + reviewed PR; main is production-connected and may auto-deploy."
  exit 1
}

git add .

if (git diff --cached --quiet) {
  Write-Host "Nothing staged to commit (working tree clean or no changes)."
  exit 0
}

git commit -m $msg
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

git push -u origin $branch
exit $LASTEXITCODE
