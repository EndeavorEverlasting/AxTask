# Shared Task Tracker program design + G1 dry-run prototype

- Merged planning PR #159 onto `main` (operator tutorials, install checklist, AXQ-011/012, Phase 3 S0/G1–G5).
- Added durable program design: `docs/SHARED_TASK_TRACKER_PROGRAM_DESIGN.md` (outcomes, vocabulary, alternatives, call stacks, proof ceiling).
- Prototyped the G1 dry-run seam as executable code: `shared/tracker-source-dryrun.ts` with focused success/failure tests — no Google API writes, no `create_task`, no legacy `/api/google-sheets/sync` reuse.
- AXQ-012 remains BLOCKED on AXQ-009 A6 for full G1 route/apply; S0 remains OPERATOR (Apps Script install).
