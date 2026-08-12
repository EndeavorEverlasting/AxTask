param(
  [string[]]$SearchRoot = @(),
  [switch]$Fetch,
  [switch]$EnsureArtifactWorktree,
  [string]$RequiredArtifact = 'scripts/ai-harness/resolve-checkout.mjs',
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

function Invoke-GitCapture([string]$Path, [string[]]$GitArgs) {
  $savedErrorPreference = $ErrorActionPreference
  $nativeVar = Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
  $savedNativePreference = if ($null -ne $nativeVar) { $PSNativeCommandUseErrorActionPreference } else { $null }
  try {
    $ErrorActionPreference = 'Continue'
    if ($null -ne $nativeVar) { $PSNativeCommandUseErrorActionPreference = $false }
    $output = & git -C $Path @GitArgs 2>$null
    $status = $LASTEXITCODE
    return [pscustomobject]@{ Status = $status; Output = @($output) }
  }
  finally {
    $ErrorActionPreference = $savedErrorPreference
    if ($null -ne $nativeVar) { $PSNativeCommandUseErrorActionPreference = $savedNativePreference }
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

  return [pscustomobject]@{
    root = $root
    origin = [string]$origin.Output[0]
    head = if ($head.Status -eq 0 -and $head.Output.Count) { [string]$head.Output[0] } else { $null }
    branch = if ($branch.Status -eq 0 -and $branch.Output.Count -and $branch.Output[0]) { [string]$branch.Output[0] } else { '(detached)' }
    status = @($dirty.Output)
  }
}

function Test-ArtifactAtRef([string]$Checkout, [string]$Ref, [string]$Artifact) {
  if ([string]::IsNullOrWhiteSpace($Checkout) -or [string]::IsNullOrWhiteSpace($Ref) -or [string]::IsNullOrWhiteSpace($Artifact)) { return $false }
  $probe = Invoke-GitCapture $Checkout @('cat-file','-e',("{0}:{1}" -f $Ref,$Artifact))
  return ($probe.Status -eq 0)
}

function Test-MaterializedArtifact([string]$Checkout, [string]$Artifact) {
  if ([string]::IsNullOrWhiteSpace($Checkout) -or [string]::IsNullOrWhiteSpace($Artifact)) { return $false }
  try {
    $root = [IO.Path]::GetFullPath($Checkout)
    $candidate = [IO.Path]::GetFullPath((Join-Path $root $Artifact))
    $prefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { return $false }
    return (Test-Path -LiteralPath $candidate -PathType Leaf)
  } catch {
    return $false
  }
}

function Test-UsableArtifact([string]$Checkout, [string]$Ref, [string]$Artifact) {
  return (Test-ArtifactAtRef $Checkout $Ref $Artifact) -and (Test-MaterializedArtifact $Checkout $Artifact)
}

function Add-Candidate([System.Collections.Generic.List[string]]$List, [System.Collections.Generic.HashSet[string]]$Seen, [string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  try { $full = [IO.Path]::GetFullPath($Path) } catch { return }
  if ($Seen.Add($full.ToLowerInvariant())) { [void]$List.Add($full) }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required to resolve the AxTask checkout.'
}
if ($EnsureArtifactWorktree -and -not $Fetch) {
  throw '-EnsureArtifactWorktree requires -Fetch so the intended origin/main SHA is explicit.'
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
  if ($Json) {
    $result | ConvertTo-Json -Depth 6
  } else {
    Write-Host '[axtask-operator-preflight] FAIL no canonical checkout found'
    Write-Host $result.nextAction
    Write-Host ('searched=' + ($result.searchedRoots -join '; '))
  }
  return
}

$primary = $found[0]
$fetchStatus = 'not-requested'
$originMain = $null
if ($Fetch) {
  & git -C $primary.root fetch --no-force origin main
  if ($LASTEXITCODE -ne 0) { throw "AxTask fetch failed with exit code $LASTEXITCODE" }
  $fetchStatus = 'passed'
  $remote = Invoke-GitCapture $primary.root @('rev-parse','origin/main')
  if ($remote.Status -ne 0 -or $remote.Output.Count -eq 0) { throw 'Fetch completed but origin/main could not be resolved.' }
  $originMain = [string]$remote.Output[0]
}

$selected = $primary
$artifactAvailable = Test-UsableArtifact $selected.root 'HEAD' $RequiredArtifact
$exactShaWorktreeCreated = $false

if ($EnsureArtifactWorktree -and -not $artifactAvailable) {
  if ([string]::IsNullOrWhiteSpace($originMain)) {
    throw 'The selected checkout is stale or does not materialize the required artifact, and no fetched origin/main SHA is available.'
  }
  if (-not (Test-ArtifactAtRef $primary.root $originMain $RequiredArtifact)) {
    throw "Required artifact '$RequiredArtifact' is absent from both selected HEAD and fetched origin/main."
  }

  $existingExact = @($found | Where-Object { $_.head -eq $originMain -and (Test-UsableArtifact $_.root 'HEAD' $RequiredArtifact) })
  if ($existingExact.Count -gt 0) {
    $selected = $existingExact[0]
  } else {
    $parent = Split-Path -Parent $primary.root
    $suffix = [guid]::NewGuid().ToString('N').Substring(0,8)
    $worktree = Join-Path $parent ("AxTask-harness-{0}-{1}" -f $originMain.Substring(0,8),$suffix)
    $worktreeAdd = Invoke-GitCapture $primary.root @('worktree','add','--detach',$worktree,$originMain)
    if ($worktreeAdd.Status -ne 0) { throw "Exact-SHA worktree creation failed with exit code $($worktreeAdd.Status)" }
    $selected = Probe-Checkout $worktree
    if ($null -eq $selected) { throw 'Exact-SHA worktree was created but could not be re-probed as canonical AxTask.' }
    $found += $selected
    $exactShaWorktreeCreated = $true
  }
  $artifactAvailable = Test-UsableArtifact $selected.root 'HEAD' $RequiredArtifact
  if (-not $artifactAvailable) { throw 'Exact-SHA worktree does not materialize the required tracked artifact.' }
}

$trackedResolver = Join-Path $selected.root 'scripts\ai-harness\resolve-checkout.mjs'
$trackedResolverAvailable = Test-Path -LiteralPath $trackedResolver -PathType Leaf
$nextAction = if ($artifactAvailable) {
  "Set-Location -LiteralPath '$($selected.root)'"
} else {
  "Re-run this bootstrap with -Fetch -EnsureArtifactWorktree -Json before invoking '$RequiredArtifact'."
}

$result = [ordered]@{
  ok = $true
  repository = $ExpectedRepository
  current = (Get-Location).Path
  primary = $primary.root
  selected = $selected.root
  head = $selected.head
  branch = $selected.branch
  dirty = ($selected.status.Count -gt 0)
  status = @($selected.status)
  fetch = $fetchStatus
  originMain = $originMain
  discoveredCheckouts = @($found | ForEach-Object { $_.root })
  requiredArtifact = $RequiredArtifact
  requiredArtifactAvailable = $artifactAvailable
  exactShaWorktreeCreated = $exactShaWorktreeCreated
  trackedResolver = if ($trackedResolverAvailable) { $trackedResolver } else { $null }
  nextAction = $nextAction
}

if ($Json) {
  $result | ConvertTo-Json -Depth 6
  return
}

$trackedResolverDisplay = if ($result.trackedResolver) { $result.trackedResolver } else { '(not present in selected checkout)' }
Write-Host "[axtask-operator-preflight] PASS repository=$ExpectedRepository"
Write-Host "current=$($result.current)"
Write-Host "primary=$($result.primary)"
Write-Host "selected=$($result.selected)"
Write-Host "head=$($result.head)"
Write-Host "branch=$($result.branch)"
Write-Host "dirty=$($result.dirty)"
if ($Fetch) { Write-Host "origin/main=$($result.originMain)" }
Write-Host "requiredArtifactAvailable=$($result.requiredArtifactAvailable)"
Write-Host "trackedResolver=$trackedResolverDisplay"
Write-Host "next=$($result.nextAction)"

if ($result.dirty) {
  Write-Host '[axtask-operator-preflight] NOTE preserve dirty work; use managed isolation before unrelated mutation.'
}
