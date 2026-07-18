# AxTask DeepSeek night sprint

This directory contains the compact AxTask runtime objective compiled from the AI Harness Prompt Kit V38 night-shift rules and AxTask's current repository law.

The objective and the launcher are different artifacts:

- `docs/ops/gnhf/axtask-night-sprint.md` is the compact GNHF runtime objective.
- `scripts/ops/Start-AxTaskGnhfNight.ps1` is the directory-first PowerShell launch artifact.
- `Run-AxTaskGnhfNight.cmd` is the one-click Windows entrypoint.

Do not paste the runtime objective into a terminal and do not replace the launcher with a regular AI prompt.

## Preferred launch

From a clean checkout of `ops/deepseek-gnhf-night-sprint`, double-click:

```text
Run-AxTaskGnhfNight.cmd
```

The CMD launcher enters the AxTask repository through `%~dp0`, then calls the repository-owned PowerShell launcher. The PowerShell launcher independently resolves the repository from `$PSScriptRoot`, validates it, and calls `Set-Location` before Git, installation, provider, or GNHF logic.

The launcher uses variables rather than a machine-specific username.

## Control-plane dependency

The AxTask launcher expects the AgentSwitchboard provider-route repair branch to be present at:

```text
$HOME\Desktop\dev\AgentSwitchboard
```

It invokes:

```text
tooling\gnhf\Install-ProviderRoutedGnhf.ps1 -Apply
```

when `-RepairControlPlane` is supplied or the installed provider launcher is absent. The repair requires GNHF `0.1.42` or newer and verifies that GNHF exposes `--model` before installing the provider-routed launcher under `%LOCALAPPDATA%\AgentSwitchboard\GnhfFleet`.

No provider sign-in is automated and no provider value is written into AxTask.

## Provider route

The truthful route is:

```text
operator route: DeepSeek
GNHF adapter:   OpenCode
provider/model: deepseek/deepseek-v4-pro
```

The installed AgentSwitchboard launcher:

1. dispatches Windows `.ps1` command shims through PowerShell instead of treating them as native executables;
2. requires GNHF `0.1.42` or newer and verified `--model` support;
3. requires OpenCode `1.14.24` or newer;
4. enumerates the exact DeepSeek model;
5. runs one bounded direct OpenCode response probe;
6. stops before GNHF when provider preflight fails;
7. passes the exact model to GNHF with `--model`;
8. requires a new local commit ahead of the base instead of trusting process exit zero.

This prevents one provider preflight failure from being rediscovered as three consecutive GNHF iterations. A provider can still fail after a successful preflight; that remains operational evidence, not an AxTask defect.

## PowerShell usage

The repository-owned script may also be run directly:

```powershell
$RepoPath = Join-Path (Join-Path $HOME "Desktop\dev") "AxTask"

if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
    throw "AxTask repository directory not found: $RepoPath"
}

Set-Location -LiteralPath $RepoPath

pwsh -NoLogo -NoProfile `
  -File ".\scripts\ops\Start-AxTaskGnhfNight.ps1" `
  -RepairControlPlane
```

The first run does not push, merge, deploy, release, or mutate live services.

## Failure evidence

Provider preflight and launch evidence is written outside AxTask under:

```text
%LOCALAPPDATA%\AgentSwitchboard\GnhfFleet\logs\provider-routes
```

When provider discovery, response, quota, networking, command dispatch, or model compatibility fails, GNHF is not started. Preserve the evidence file and fix the control plane rather than changing AxTask.

## Morning review

From the AxTask repository root:

```powershell
git worktree list
git branch --list "gnhf/*" --sort=-committerdate
git log --oneline --decorate --all -15
```

Enter the selected generated worktree and run:

```powershell
git status --short
git log --oneline --decorate -5
git show --stat --oneline HEAD
git diff HEAD^ HEAD
npm run check
```

Run the targeted command recorded in `docs/ops/gnhf/AXTASK_NIGHT_REPORT.md` before considering push or PR creation.

## Proof boundary

A successful provider probe proves only that the exact DeepSeek model responded through OpenCode in the local Windows execution domain. A GNHF exit code proves only process completion. Delivery requires the tracked report, validation evidence, and a local commit ahead of the base. Push, review, merge, deployment, database state, and production behavior remain separate operator gates.
