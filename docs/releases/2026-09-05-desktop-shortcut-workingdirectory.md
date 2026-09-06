# Fix: Desktop shortcut WorkingDirectory PathInfo coercion

Date: 2026-09-05

Branch: `fix/desktop-shortcut-workingdirectory`

## Summary

`npm run offline:shortcut` failed on Windows PowerShell before writing a `.lnk`.

`tools/local/create-desktop-shortcut.ps1` assigned `Resolve-Path` (a `PathInfo`) to the WScript COM `WorkingDirectory` setter, which accepts only a `string`. With `$ErrorActionPreference = "Stop"`, the script exited before `$shortcut.Save()`.

## Change

- `tools/local/create-desktop-shortcut.ps1`: coerce with `.Path` at resolution so both `Join-Path` and the COM setter receive a string.

## Scope

- Local developer convenience launcher only.
- No application runtime, schema, env, Docker, Render, or production behavior changes.

## Validation

- `npm run offline:shortcut` — creates Desktop `Start AxTask Offline.lnk` (exit 0).
- Shortcut read-back via `WScript.Shell`: `TargetPath` and `WorkingDirectory` resolve to `AxTask-gh\start-offline.cmd` and the repo root.
- `npm run release:check`

## Rollback

Revert the one-line `.Path` coercion; launcher returns to the pre-fix broken state. No database or deploy impact.
