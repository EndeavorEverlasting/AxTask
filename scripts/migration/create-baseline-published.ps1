<#
.SYNOPSIS
  Create (or reset) branch baseline/published at the exact commit running in production.

.DESCRIPTION
  Pass the deploy commit SHA from your host (Replit/Render/etc.). Never guess: dashboard
  or `git rev-parse` on the machine that built the running image.

.PARAMETER Commit
  Full or short Git SHA for commit P.

.EXAMPLE
  .\scripts\migration\create-baseline-published.ps1 -Commit b8068c0
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Commit
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

git fetch origin
$resolved = git rev-parse --verify "${Commit}^{commit}" 2>$null
if (-not $resolved) {
  throw "Invalid commit: $Commit (not found in repository)"
}

if (git show-ref --verify --quiet "refs/heads/baseline/published") {
  git branch -f "baseline/published" $resolved
  Write-Host "Updated local baseline/published -> $resolved"
} else {
  git branch "baseline/published" $resolved
  Write-Host "Created local baseline/published -> $resolved"
}

Write-Host "Next: git push -u origin baseline/published"
Write-Host "Optional tag: git tag -a published-baseline-$(Get-Date -Format 'yyyy-MM-dd') $resolved -m 'Published app baseline'"
