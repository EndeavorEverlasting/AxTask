# AxTask DeepSeek night sprint

This directory contains the bounded AxTask objective compiled from the AI Harness Prompt Kit V38 night-shift rules and AxTask's current repository law.

## Preferred launch

Prerequisites:

- AgentSwitchboard branch containing the DeepSeek GNHF route is installed or bootstrapped.
- OpenCode `1.14.24` or newer is READY in AgentSwitchboard.
- DeepSeek is connected interactively inside OpenCode.
- `opencode models deepseek` lists the exact selected model.
- The AxTask checkout is clean and is not a production-connected working branch.

From the AxTask repository root in PowerShell 7:

```powershell
& "$env:LOCALAPPDATA\AgentSwitchboard\GnhfFleet\agent-switchboard.cmd" `
  -RepoPath (Get-Location).Path `
  -Agent deepseek `
  -DeepSeekModel "deepseek/deepseek-v4-pro" `
  -PromptPath (Join-Path (Get-Location).Path "docs\ops\gnhf\axtask-night-sprint.md") `
  -Name "axtask-deepseek-night" `
  -MaxIterations 8 `
  -MaxTokens 800000 `
  -ProbeTimeoutSeconds 20 `
  -StopWhen "One non-colliding AxTask root cause is repaired and committed with deterministic targeted enforcement, npm run check, and AXTASK_NIGHT_REPORT.md; or a report-only commit proves with exact evidence why no safe implementation was available."
```

Do not add `-PushBranch` for the first night run. The expected result is an isolated GNHF worktree with a local commit for morning review.

## What the launcher proves before starting

The AgentSwitchboard route:

1. maps the operator alias `deepseek` to the native GNHF `opencode` adapter;
2. requires OpenCode `1.14.24` or newer;
3. enumerates the exact DeepSeek model;
4. launches that exact model in a temporary directory with a 20-second timeout;
5. requires a positive success marker;
6. pins the model through an in-process OpenCode configuration override;
7. restores the previous OpenCode inline configuration after GNHF exits.

Provider authentication, quota, network, model discovery, timeout, and malformed-output failures stop before AxTask repository work begins.

## Morning review

List GNHF worktrees and inspect the latest branch without merging it automatically:

```powershell
git worktree list
git branch --list "gnhf/*" --sort=-committerdate
git log --oneline --decorate --all -15
```

Then enter the selected worktree and run:

```powershell
git status --short
git log --oneline --decorate -5
git show --stat --oneline HEAD
git diff HEAD^ HEAD
npm run check
```

Run the targeted command recorded in `docs/ops/gnhf/AXTASK_NIGHT_REPORT.md` before considering push or PR creation.

## Proof boundary

A successful provider probe proves only that the selected DeepSeek model responded through OpenCode in the local execution domain. A GNHF exit code proves only process completion. Delivery requires the tracked report, validation evidence, and a local commit ahead of the base. Push, PR review, merge, deployment, database state, and production behavior remain separate operator gates.
