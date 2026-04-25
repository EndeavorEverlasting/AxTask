<#
.SYNOPSIS
  Create a date-stamped checkpoint branch with optional commit and push.

.DESCRIPTION
  Shows git status context, creates a branch using:
    feature/YYYY-MM-DD-context-slug
  Then optionally commits and pushes with explicit confirmation.

.PARAMETER Slug
  Context slug for the branch suffix (example: axtask-reminder-intent-engine).

.PARAMETER CommitMessage
  Commit message to use when committing.

.PARAMETER Commit
  If provided, commit without interactive prompt.

.PARAMETER Push
  If provided, push without interactive prompt.

.PARAMETER NonInteractive
  Skip prompts. Only actions requested via switches are executed.

.EXAMPLE
  .\scripts\git-checkpoint.ps1

.EXAMPLE
  .\scripts\git-checkpoint.ps1 -Slug axtask-reminder-intent-engine

.EXAMPLE
  .\scripts\git-checkpoint.ps1 -Slug axtask-reminder-intent-engine -Commit -Push
#>
param(
  [string]$Slug,
  [string]$CommitMessage,
  [switch]$Commit,
  [switch]$Push,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function ConvertTo-Slug {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InputSlug
  )

  $normalized = $InputSlug.Trim().ToLowerInvariant()
  $normalized = $normalized -replace "[^a-z0-9/_-]+", "-"
  $normalized = $normalized -replace "-{2,}", "-"
  $normalized = $normalized -replace "/{2,}", "/"
  $normalized = $normalized.Trim("-/")

  return $normalized
}

function Confirm-Action {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt
  )

  if ($NonInteractive) {
    return $false
  }

  $answer = Read-Host "$Prompt [y/N]"
  return $answer -match "^(y|yes)$"
}

Write-Host "Reviewing current state..."
Invoke-Git -Args @("status")
Invoke-Git -Args @("diff", "--stat")
Invoke-Git -Args @("diff", "--name-only")

if (-not $Slug) {
  if ($NonInteractive) {
    throw "Slug is required when -NonInteractive is used."
  }
  $Slug = Read-Host "Branch context slug"
}

$safeSlug = ConvertTo-Slug -InputSlug $Slug
if (-not $safeSlug) {
  throw "Branch context slug is empty after normalization."
}

$date = Get-Date -Format "yyyy-MM-dd"
$branchName = "feature/$date-$safeSlug"

& git show-ref --verify --quiet "refs/heads/$branchName"
if ($LASTEXITCODE -eq 0) {
  throw "Branch already exists locally: $branchName"
}

Write-Host "Creating branch: $branchName"
Invoke-Git -Args @("switch", "-c", $branchName)

$shouldCommit = $Commit.IsPresent
if (-not $shouldCommit) {
  $shouldCommit = Confirm-Action -Prompt "Create checkpoint commit now?"
}

if ($shouldCommit) {
  if (-not $CommitMessage) {
    $CommitMessage = "Checkpoint ${date}: $safeSlug"
  }

  Write-Host "Staging all changes..."
  Invoke-Git -Args @("add", ".")

  & git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No staged changes after git add. Skipping commit."
  } else {
    Write-Host "Committing checkpoint..."
    Invoke-Git -Args @("commit", "-m", $CommitMessage)
  }
}

$shouldPush = $Push.IsPresent
if (-not $shouldPush) {
  $shouldPush = Confirm-Action -Prompt "Push branch to origin?"
}

if ($shouldPush) {
  Write-Host "Pushing branch to origin..."
  Invoke-Git -Args @("push", "-u", "origin", $branchName)
}

Write-Host "Checkpoint branch ready: $branchName"
