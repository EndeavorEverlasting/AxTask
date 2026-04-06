<#
.SYNOPSIS
  Print SHAs and commit/schema deltas for migration refs (main, experimental/next,
  replit-published-preproduction-clean, baseline/published, origin/baseline/published).

.EXAMPLE
  .\scripts\migration\compare-migration-refs.ps1
#>
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

Write-Host "=== Fetch ===" -ForegroundColor Cyan
git fetch origin

$refs = @(
  "main",
  "experimental/next",
  "integration/migration-unified",
  "origin/replit-published-preproduction-clean",
  "baseline/published",
  "origin/baseline/published"
)

Write-Host "`n=== Short SHAs ===" -ForegroundColor Cyan
foreach ($r in $refs) {
  $sha = git rev-parse --short $r 2>$null
  if ($LASTEXITCODE -eq 0 -and $sha) {
    Write-Host "$r -> $sha"
  } else {
    Write-Host "$r -> (missing)" -ForegroundColor Yellow
  }
}

Write-Host "`n=== main vs experimental/next (commits) ===" -ForegroundColor Cyan
git log --oneline main..experimental/next
git log --oneline experimental/next..main

Write-Host "`n=== experimental/next NOT in replit-published-preproduction-clean ===" -ForegroundColor Cyan
git log --oneline origin/replit-published-preproduction-clean..experimental/next

Write-Host "`n=== replit-published-preproduction-clean NOT in experimental/next ===" -ForegroundColor Cyan
git log --oneline experimental/next..origin/replit-published-preproduction-clean | Select-Object -First 25
$more = git rev-list --count experimental/next..origin/replit-published-preproduction-clean 2>$null
if (-not [string]::IsNullOrWhiteSpace([string]$more)) {
  try {
    $moreInt = [int]$more
    if ($moreInt -gt 25) { Write-Host "... ($moreInt commits total on replit side)" }
  } catch {
    # ignore non-integer git output
  }
}

Write-Host "`n=== experimental/next NOT in origin/baseline/published (Replit branch noise check) ===" -ForegroundColor Cyan
git log --oneline origin/baseline/published..experimental/next | Select-Object -First 15

Write-Host "`n=== origin/baseline/published NOT in experimental/next ===" -ForegroundColor Cyan
git log --oneline experimental/next..origin/baseline/published | Select-Object -First 20

Write-Host "`n=== shared/schema.ts diff stat ===" -ForegroundColor Cyan
Write-Host "--- replit-published-preproduction-clean .. experimental/next ---"
git diff --stat origin/replit-published-preproduction-clean..experimental/next -- shared/schema.ts
Write-Host "--- origin/baseline/published .. experimental/next ---"
git diff --stat origin/baseline/published..experimental/next -- shared/schema.ts

Write-Host "`nMerge-base (replit-clean, experimental):" (git merge-base origin/replit-published-preproduction-clean experimental/next)
Write-Host "Merge-base (origin/baseline/published, experimental):" (git merge-base origin/baseline/published experimental/next)

Write-Host "`nSee docs/PRODUCTION_MIGRATION_BRANCH_REPORT.md for interpretation." -ForegroundColor Green
