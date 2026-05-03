<#
.SYNOPSIS
  Logical backup of AxTask Postgres using pg_dump (custom format).

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

# -Fc custom format for pg_restore; --no-owner helps cross-host restore
& pg_dump --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is on PATH."
}

Write-Host "pg_dump -> $OutFile"
& pg_dump $DatabaseUrl -Fc -f $OutFile --no-owner
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Backup complete."
