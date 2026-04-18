# CI polling for agents

How to watch GitHub Actions from an agent session without hanging the shell. Written after a real incident where a foreground `gh pr checks --watch` piped into `Select-Object -Last 15` silently froze for 10+ minutes because the upstream cmdlet buffered its entire output before emitting anything.

If you only read one thing: **do not pipe a long-running `--watch` into `Select-Object -Last N` or `Select-String` in the foreground.** Pick pattern A below.

## TL;DR

After `git push`, confirm CI goes green like this:

1. `Await` for ~20s so GitHub schedules the run.
2. `gh pr checks <N> --json name,status,conclusion --jq '.[] | [.name,.status,.conclusion] | @tsv'` — returns instantly, no pager, no streaming.
3. If any row is `IN_PROGRESS`, `Await` for 30–60s and repeat step 2 (exponential backoff: 20s -> 30s -> 60s -> 120s -> 180s).
4. Stop when all non-`SKIPPED` / non-`NEUTRAL` rows have a `conclusion`.

That is it. `--watch` is almost never the right choice from inside an agent shell.

## Why `--watch | Select-Object -Last N` hangs

The exact command that wedged a prior session:

```powershell
Start-Sleep -Seconds 15; gh pr checks 3 --watch --interval 20 2>&1 | Select-Object -Last 15
```

Three problems compound:

1. `Select-Object -Last N` **buffers the entire upstream pipeline.** It cannot emit anything until the producer closes stdout, so nothing streams while `gh pr checks --watch` is alive. The shell looks frozen even when CI is actively updating.
2. `gh pr checks --watch` returns only when **every** required check reaches a terminal state (success, failure, cancelled). A single 1m30s `test-and-attest` job plus a docker-build job easily runs 2–4 minutes; re-pushes multiply that.
3. Because the pipeline never flushes bytes, `Await` has nothing to pattern-match against — `pattern:` matches the terminal file body, and the body is empty until the very end. The agent cannot short-circuit on success.

Combined: the foreground `block_until_ms` timer expires, the task is backgrounded, and the agent now has to poll the terminal file manually anyway — the worst of both worlds.

## Patterns to use

### Pattern A — Snapshot poll (default)

Returns in ~1s, safe to loop from the agent side.

```powershell
gh pr checks 3 --json name,status,conclusion --jq '.[] | [.name,.status,.conclusion] | @tsv'
```

Between polls, use `Await` without a `task_id` to sleep without running another shell.

### Pattern B — Headless watch with `Await` pattern

When you genuinely want to block until CI settles, run the watch truly backgrounded and let `Await` scan the terminal output for the exit line.

Shell call:

```
block_until_ms: 0
command: gh pr checks 3 --watch --interval 15
```

Then:

```
Await
  task_id: <shell id from the previous call>
  block_until_ms: 600000
  pattern: All checks were successful|Some checks were not successful|no checks reported
```

`gh` prints one of those exact strings on exit, so `Await` returns the moment CI settles instead of your best-guess timeout.

### Pattern C — Structured scriptable poll (branchable in one line)

```powershell
gh pr checks 3 --json conclusion --jq 'map(select(.conclusion!="SKIPPED" and .conclusion!="NEUTRAL")) | [all(.conclusion=="SUCCESS"), any(.conclusion=="FAILURE")]'
```

- `[true, false]` — all green, safe to merge/deploy.
- `[false, true]` — at least one failure, stop and investigate.
- `[false, false]` — still running, poll again.

Good inside a PowerShell `if` or a one-shot agent decision.

### Pattern D — Per-run watch

If you already have a specific workflow run ID (for example, the one triggered by your most recent push):

```powershell
gh run watch <run-id> --exit-status
```

`--exit-status` causes a non-zero exit on failure, which is friendlier to `Await` pattern matching than `gh pr checks`.

## Anti-patterns

- `... --watch | Select-Object -Last N` — buffers forever. If you want only the tail, tee to a file (`| Tee-Object -FilePath ci.log`) and read it with `Get-Content -Tail N` **after** the watch settles, or skip the `Select-Object` entirely.
- `... --watch | Select-String ...` — same buffering issue; `Select-String` is also a .NET cmdlet that holds the full upstream stream.
- `Start-Sleep -Seconds N; <long-command>` inside one `block_until_ms` budget — the sleep eats into the foreground timeout and the long command gets backgrounded anyway. Sleep belongs in `Await` (omit `task_id`, it becomes a plain timer), not chained in-shell.
- Picking `block_until_ms` by guessing CI duration. For any `--watch`, use `block_until_ms: 0` and rely on an `Await` pattern for the terminal transition.
- Calling `gh pr checks <N>` with no `--json` and parsing the human table. The table columns shift; structured output is stable.

## Baseline recipe (copy-paste)

For "push a fix, confirm CI turns green":

1. Push the commit.
2. `Await block_until_ms: 20000` (no `task_id`) to let GitHub schedule the run.
3. Shell: `gh pr checks <N> --json name,status,conclusion --jq '.[] | [.name,.status,.conclusion] | @tsv'`.
4. If any row shows `IN_PROGRESS` or `QUEUED`, `Await` for 30s and re-run step 3. On each retry, double the wait up to 180s.
5. Hard cap: after 6 polls (~10 minutes) with no terminal state, inspect the run manually (`gh run view <run-id> --log-failed`) rather than blindly polling further.

Only upgrade to pattern B when you need a hands-off "block until green" gate — for example, before an automated merge.

## PowerShell footnote

- `^` is PowerShell's escape character, so `git log a..b ^c` is interpreted as `git log a..b c` with a stray escape and can hang waiting for more input. Use `git log "a..b" --not c` or `git log b --not a c` instead.
- Use `git --no-pager <subcommand>` in scripts; an unexpected pager blocks the shell the same way `--watch` does.
- Prefer `Stop-Process -Id <pid> -Force` (from the terminal file's `pid:` header) over re-running a shell to kill a hung job.

## Related

- [docs/GIT_BRANCHING_AND_DEPLOYMENT.md](GIT_BRANCHING_AND_DEPLOYMENT.md) — branch hygiene before the push that triggers the CI run this doc helps you observe.
- [AGENTS.md](../AGENTS.md) — top-level agent notes; the "CI polling (agent sessions)" section links back here.
