param(
  [string[]]$SearchRoot = @(),
  [switch]$Fetch,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$ExpectedRepository = 'EndeavorEverlasting/AxTask'

function Normalize-Origin([string]$Origin) {
  if ([string]::IsNullOrWhiteSpace($Origin)) { return '' }
  return $Origin.Trim() -replace '\.git$',''
}

function Test-CanonicalOrigin([string]$Origin) {
  $value = Normalize-Origin $Origin
  return (
    $value -match '^https://github\.com/EndeavorEverlasting/AxTask$' -or
    $value -match '^git@github\.com:EndeavorEverlasting/AxTask$' -or
    $value -match '^ssh://git@github\.com/EndeavorEverlasting/AxTask$'
  )
}

function Invoke-GitCapture([string]$Path, [string[]]$Args) {
  # Probing an arbitrary candidate is expected to produce Git exit 128 for
  # non-repositories. PowerShell 7 may promote native nonzero exits to
  # terminating errors when PSNativeCommandUseErrorActionPreference is enabled,
  # so disable that behavior only inside this bounded probe and classify via
  # LASTEXITCODE ourselves.
  $hadNativePreference = $null -ne (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)
  if ($hadNativePreference) { $savedNativePreference = $PSNativeCommandUseErrorActionPreference }
  try {
    if ($hadNativePreference) { $PSNativeCommandUseErrorActionPreference = $false }
    $output = & git -C $Path @Args 2>$null
    $status = $LASTEXITCODE
    [pscustomobject]@{ Status = $status; Output = @($output) }
  }
  finally {
    if ($hadNativePreference) { $PSNativeCommandUseErrorActionPreference = $savedNativePreference }
  }
}

function Probe-Checkout([string]$Candidate) {
  if ([string]::IsNullOrWhiteSpace($Candidate) -or -not (Test-Path -LiteralPath $Candidate -PathType Container)) { return $null }

  $top = Invoke-GitCapture $Candidate @('rev-parse','--show-toplevel')
  if ($top.Status -ne 0 -or $top.Output.Count -eq 0) { return $null }
  $root = [IO.Path]::GetFullPath([string]$top.Output[0])

  $origin = Invoke-GitCapture $root @('remote','get-url','origin')
  if ($origin.Status -ne 0 -or $origin.Output.Count -eq 0 -or -not (Test-CanonicalOrigin ([string]$origin.Output[0]))) { return $null }

  $head = Invoke-GitCapture $root @('rev-parse','HEAD')
  $branch = Invoke-GitCapture $root @('branch','--show-current')
  $dirty = Invoke-GitCapture $root @('status','--short')

  [pscustomobject]@{
    root = $root
    origin = [string]$origin.Output[0]
    head = if ($head.Status -eq 0 -and $head.Output.Count) { [string]$head.Output[0] } else { $null }
    branch = if ($branch.Status -eq 0 -and $branch.Output.Count -and $branch.Output[0]) { [string]$branch.Output[0] } else { '(detached)' }
    status = @($dirty.Output)
  }
}

function Add-Candidate([System.Collections.Generic.List[string]]$List, [System.Collections.Generic.HashSet[string]]$Seen, [string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  try { $full = [IO.Path]::GetFullPath($Path) } catch { return }
  if ($Seen.Add($full.ToLowerInvariant())) { $List.Add($full) }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required to resolve the AxTask checkout.'
}

$homeDir = [Environment]::GetFolderPath('UserProfile')
$roots = [System.Collections.Generic.List[string]]::new()
$rootSeen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($root in @(
  (Get-Location).Path,
  (Split-Path -Parent (Get-Location).Path),
  (Join-Path $homeDir 'Desktop\Dev'),
  (Join-Path $homeDir 'Desktop\dev'),
  (Join-Path $homeDir 'dev')
) + $SearchRoot) {
  Add-Candidate $roots $rootSeen $root
}

$candidates = [System.Collections.Generic.List[string]]::new()
$candidateSeen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($root in $roots) {
  Add-Candidate $candidates $candidateSeen $root
  if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
  foreach ($child in Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue) {
    Add-Candidate $candidates $candidateSeen $child.FullName
    if ($child.Name -match '^AxTask(?:-|$)' -or $child.Name -match '^axtask-worktrees(?:-|$)') {
      foreach ($grandchild in Get-ChildItem -LiteralPath $child.FullName -Directory -Force -ErrorAction SilentlyContinue) {
        Add-Candidate $candidates $candidateSeen $grandchild.FullName
      }
    }
  }
}

$found = @()
$foundSeen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in $candidates) {
  $probe = Probe-Checkout $candidate
  if ($null -ne $probe -and $foundSeen.Add($probe.root)) { $found += $probe }
}

if ($found.Count -eq 0) {
  $result = [ordered]@{
    ok = $false
    repository = $ExpectedRepository
    current = (Get-Location).Path
    searchedRoots = @($roots)
    error = 'No canonical AxTask checkout was found. A folder named AxTask is not repository identity.'
    nextAction = 'Inspect the occupied AxTask folder before cloning. Do not git init, reset, clean, delete, or overwrite it.'
  }
  if ($Json) { $result | ConvertTo-Json -Depth 6 } else {
    Write-Host '[axtask-operator-preflight] FAIL no canonical checkout found'
    Write-Host $result.nextAction
    Write-Host ('searched=' + ($result.searchedRoots -join '; '))
  }
  exit 2
}

$primary = $found[0]
$fetchStatus = 'not-requested'
$originMain = $null
if ($Fetch) {
  & git -C $primary.root fetch --no-force origin main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $fetchStatus = 'passed'
  $remote = Invoke-GitCapture $primary.root @('rev-parse','origin/main')
  if ($remote.Status -eq 0 -and $remote.Output.Count) { $originMain = [string]$remote.Output[0] }
}

$trackedResolver = Join-Path $primary.root 'scripts\ai-harness\resolve-checkout.mjs'
$trackedResolverAvailable = Test-Path -LiteralPath $trackedResolver -PathType Leaf
$result = [ordered]@{
  ok = $true
  repository = $ExpectedRepository
  current = (Get-Location).Path
  primary = $primary.root
  head = $primary.head
  branch = $primary.branch
  dirty = ($primary.status.Count -gt 0)
  status = @($primary.status)
  fetch = $fetchStatus
  originMain = $originMain
  discoveredCheckouts = @($found | ForEach-Object { $_.root })
  trackedResolver = if ($trackedResolverAvailable) { $trackedResolver } else { $null }
  nextAction = "Set-Location -LiteralPath '$($primary.root)'"
}

if ($Json) {
  $result | ConvertTo-Json -Depth 6
  exit 0
}

Write-Host "[axtask-operator-preflight] PASS repository=$ExpectedRepository"
Write-Host "current=$($result.current)"
Write-Host "primary=$($result.primary)"
Write-Host "head=$($result.head)"
Write-Host "branch=$($result.branch)"
Write-Host "dirty=$($result.dirty)"
if ($Fetch) { Write-Host "origin/main=$($result.originMain)" }
Write-Host "trackedResolver=$($result.trackedResolver ?? '(not present in this checkout)')"
Write-Host "next=$($result.nextAction)"

if ($result.dirty) {
  Write-Host '[axtask-operator-preflight] NOTE preserve dirty work; use managed isolation before unrelated mutation.'
}
