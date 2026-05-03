<#
.SYNOPSIS
  Restore pg_dump custom-format backup into target database.

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
  Write-Error "Backup file not found: $BackupFile"
}

& pg_restore --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_restore not found. Install PostgreSQL client tools."
}

Write-Host "pg_restore <- $BackupFile"
# --no-owner --role=... optional; target must be empty or use --clean (destructive)
& pg_restore -d $DatabaseUrl --no-owner --exit-on-error $BackupFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Restore complete. Then: npm run db:push (from integration/migration-unified) and npm run migration:verify-schema"
