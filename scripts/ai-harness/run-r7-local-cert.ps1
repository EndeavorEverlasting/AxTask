[CmdletBinding()]
param(
  [string]$CandidateSha = "",
  [string]$PostgresImage = "postgres:16-alpine"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Label
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Get-GitScalar {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $output = @(& git @Arguments 2>$null)
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode"
  }
  $value = ($output -join "`n").Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Label returned no value"
  }
  return $value
}

function Save-EnvironmentValue {
  param([string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  [pscustomobject]@{ Name = $Name; HadValue = $null -ne $value; Value = $value }
}

function Restore-EnvironmentValue {
  param($Snapshot)
  if ($Snapshot.HadValue) {
    [Environment]::SetEnvironmentVariable($Snapshot.Name, $Snapshot.Value, 'Process')
  } else {
    [Environment]::SetEnvironmentVariable($Snapshot.Name, $null, 'Process')
  }
}

foreach ($required in @('git', 'node', 'npm', 'docker')) {
  if (-not (Get-Command $required -ErrorAction SilentlyContinue)) {
    throw "R7 session-safe runner requires '$required' on PATH."
  }
}

$repoRoot = Get-GitScalar -Arguments @('rev-parse', '--show-toplevel') -Label 'Resolve Git top-level'
Set-Location -LiteralPath $repoRoot
$head = Get-GitScalar -Arguments @('rev-parse', 'HEAD') -Label 'Resolve candidate HEAD'
if (-not [string]::IsNullOrWhiteSpace($CandidateSha) -and $head -ne $CandidateSha) {
  throw "Candidate SHA mismatch. Expected $CandidateSha; found $head."
}

$dirtyOutput = @(& git status --porcelain)
$dirtyExit = $LASTEXITCODE
if ($dirtyExit -ne 0) {
  throw "Unable to inspect candidate worktree state; git status exited $dirtyExit"
}
if ($dirtyOutput.Count -gt 0) {
  throw 'R7 requires a clean candidate worktree. Preserve unrelated work in another worktree first.'
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker is installed but the Docker daemon is unavailable.'
}

$containerName = "axtask-r7-disposable-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))-$PID"
$dbUser = 'axtask_r7'
$dbName = 'axtask_r7_test'
$dbPassword = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
$containerStarted = $false
$envNames = @('DATABASE_URL', 'AXTASK_LOCAL_CERT', 'AXTASK_CANDIDATE_SHA', 'RENDER', 'AXTASK_PRODUCTION')
$envSnapshot = @($envNames | ForEach-Object { Save-EnvironmentValue $_ })
$runError = $null
$cleanupError = $null
$proofDisplay = $null
$reportDisplay = $null

try {
  $dockerRunArgs = @(
    'run', '--rm', '-d', '--name', $containerName,
    '-e', "POSTGRES_USER=$dbUser",
    '-e', "POSTGRES_PASSWORD=$dbPassword",
    '-e', "POSTGRES_DB=$dbName",
    '-p', '127.0.0.1::5432',
    $PostgresImage
  )
  $containerOutput = @(& docker @dockerRunArgs)
  $containerExit = $LASTEXITCODE
  if ($containerExit -ne 0) {
    throw "Failed to start disposable PostgreSQL container; docker exited $containerExit"
  }
  $containerId = ($containerOutput -join "`n").Trim()
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Disposable PostgreSQL container started without returning a container id.'
  }
  $containerStarted = $true

  $ready = $false
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    & docker exec $containerName pg_isready -U $dbUser -d $dbName *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'Disposable PostgreSQL did not become ready within 60 seconds.'
  }

  $mappingOutput = @(& docker port $containerName '5432/tcp')
  $mappingExit = $LASTEXITCODE
  if ($mappingExit -ne 0) {
    throw "Unable to resolve disposable PostgreSQL host port; docker exited $mappingExit"
  }
  $mapping = [string]($mappingOutput | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($mapping)) {
    throw 'Disposable PostgreSQL host port mapping was empty.'
  }
  if ($mapping -notmatch '127\.0\.0\.1:(\d+)$') {
    throw "Unexpected disposable PostgreSQL port mapping: $mapping"
  }
  $hostPort = $Matches[1]

  $env:DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@127.0.0.1:${hostPort}/${dbName}"
  $env:AXTASK_LOCAL_CERT = '1'
  $env:AXTASK_CANDIDATE_SHA = $head
  $env:RENDER = 'false'
  $env:AXTASK_PRODUCTION = 'false'

  Write-Host "PostgreSQL container $containerName ready on 127.0.0.1:$hostPort. Running R7 local certification."

  $certOutput = @(& node scripts/deploy/run-local-cert.mjs 2>&1)
  $certExit = $LASTEXITCODE
  foreach ($line in $certOutput) { Write-Host ([string]$line) }

  $proofLine = $certOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^\[local-cert\] proof:\s+(.+)$' } | Select-Object -Last 1
  if (-not $proofLine -or $proofLine -notmatch '^\[local-cert\] proof:\s+(.+)$') {
    throw 'Local certification did not emit its canonical runtime-proof path.'
  }
  $proofRelative = $Matches[1].Trim().Replace('/', [IO.Path]::DirectorySeparatorChar)
  $proofPath = Join-Path $repoRoot $proofRelative
  if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) {
    throw "Local certification emitted a missing runtime-proof artifact: $proofRelative"
  }

  Invoke-Checked -Command 'node' -Arguments @('scripts/ai-harness/validate-runtime-proof.mjs', $proofPath) -Label 'Runtime-proof validation'

  if ($certExit -ne 0) {
    throw "R7 local certification returned NO_GO. Preserve sanitized proof at $proofRelative and route through failure recovery."
  }

  Invoke-Checked -Command 'npm' -Arguments @('run', 'test:deploy') -Label 'Deployment validator suite'
  Invoke-Checked -Command 'npm' -Arguments @('run', 'build') -Label 'Production build'

  $reportPath = Join-Path (Split-Path -Parent $proofPath) 'local-cert-report.md'
  if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw 'R7 runtime proof passed but local-cert-report.md is missing.'
  }

  $proofDisplay = [IO.Path]::GetRelativePath($repoRoot, $proofPath).Replace('\', '/')
  $reportDisplay = [IO.Path]::GetRelativePath($repoRoot, $reportPath).Replace('\', '/')
} catch {
  $runError = $_
} finally {
  foreach ($snapshot in $envSnapshot) { Restore-EnvironmentValue $snapshot }
  if ($containerStarted) {
    & docker rm -f $containerName *> $null
    if ($LASTEXITCODE -ne 0) {
      $cleanupError = "Disposable PostgreSQL cleanup failed for container $containerName. Remove it manually before handoff."
    }
  }
}

if ($runError) {
  $message = $runError.Exception.Message
  if ($cleanupError) { $message = "$message Cleanup also failed: $cleanupError" }
  throw $message
}
if ($cleanupError) {
  throw $cleanupError
}

Write-Host ''
Write-Host '=== R7 PASS ==='
Write-Host "R7_CANDIDATE_SHA=$head"
Write-Host "R7_RUNTIME_PROOF=$proofDisplay"
Write-Host "R7_LOCAL_CERT_REPORT=$reportDisplay"
Write-Host 'R7_PROOF_CEILING=local-runtime'
