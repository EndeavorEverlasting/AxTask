<#
.SYNOPSIS
  Logical backup of AxTask Postgres using pg_dump (custom format).

  For sensitive environments, avoid putting credentials on the process command line:
  use PGPASSWORD (set below from the URL) and PG* env vars, or a .pgpass file.

.PARAMETER DatabaseUrl
  Full DATABASE_URL (postgresql://...). If omitted, reads env DATABASE_URL.

.PARAMETER OutFile
  Output path, e.g. C:\backups\axtask-2026-04-04.dump

.EXAMPLE
  $env:DATABASE_URL = "postgresql://..."
  .\scripts\migration\pg-backup.ps1 -OutFile .\axtask-backup.dump
#>
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [Parameter(Mandatory = $true)]
  [string]$OutFile
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL not set and -DatabaseUrl not provided."
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# Parse URL without passing it as a pg_dump argument (hides password from process listings).
$normalized = $DatabaseUrl -replace '^postgres(ql)?://', 'https://'
try {
  $uri = [Uri]$normalized
} catch {
  Write-Error "Invalid DATABASE_URL: $_"
}

$env:PGHOST = $uri.Host
$port = $uri.Port
if ($port -lt 0) { $port = 5432 }
$env:PGPORT = "$port"
$userInfo = $uri.UserInfo
if ($userInfo) {
  $ci = $userInfo.IndexOf(':')
  if ($ci -ge 0) {
    $env:PGUSER = [Uri]::UnescapeDataString($userInfo.Substring(0, $ci))
    $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo.Substring($ci + 1))
  } else {
    $env:PGUSER = [Uri]::UnescapeDataString($userInfo)
  }
}
$env:PGDATABASE = $uri.AbsolutePath.TrimStart('/')

# -Fc custom format for pg_restore; --no-owner helps cross-host restore
$pgDumpCmd = Get-Command 'pg_dump' -ErrorAction SilentlyContinue
if (-not $pgDumpCmd) {
  Write-Error "pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is on PATH."
}

Write-Host "pg_dump -> $OutFile"
& pg_dump -Fc -f $OutFile --no-owner
$exit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
if ($exit -ne 0) { exit $exit }
Write-Host "Backup complete."
