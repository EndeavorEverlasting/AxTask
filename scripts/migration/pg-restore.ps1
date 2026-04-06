<#
.SYNOPSIS
  Restore pg_dump custom-format backup into target database.

  Passing the full connection URL as a single argument exposes the password in process
  listings. This script parses DATABASE_URL and sets PGHOST, PGPORT, PGUSER, PGPASSWORD,
  PGDATABASE, then invokes pg_restore with discrete flags. For production, prefer a .pgpass
  file or IAM auth instead of URLs with embedded passwords.

.PARAMETER DatabaseUrl
  Target empty database URL (postgresql://...).

.PARAMETER BackupFile
  Path to .dump from pg-backup.ps1

.EXAMPLE
  .\scripts\migration\pg-restore.ps1 -DatabaseUrl "postgresql://user:pass@host:5432/axtask_staging" -BackupFile .\axtask-backup.dump
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$pgRestoreCmd = Get-Command 'pg_restore' -ErrorAction SilentlyContinue
if (-not $pgRestoreCmd) {
  throw "pg_restore not found. Install PostgreSQL client tools."
}

$normalized = $DatabaseUrl -replace '^postgres(ql)?://', 'https://'
try {
  $uri = [Uri]$normalized
} catch {
  throw "Invalid DATABASE_URL: $_"
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

Write-Host "pg_restore <- $BackupFile"
# --no-owner --role=... optional; target must be empty or use --clean (destructive)
$exit = 0
try {
  & pg_restore -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE --no-owner --exit-on-error $BackupFile
} finally {
  $exit = $global:LASTEXITCODE
  Remove-Item Env:\PGHOST -ErrorAction SilentlyContinue
  Remove-Item Env:\PGPORT -ErrorAction SilentlyContinue
  Remove-Item Env:\PGUSER -ErrorAction SilentlyContinue
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\PGDATABASE -ErrorAction SilentlyContinue
}
if ($exit -ne 0) { exit $exit }
Write-Host "Restore complete. Then: npm run db:push (from integration/migration-unified) and npm run migration:verify-schema"
