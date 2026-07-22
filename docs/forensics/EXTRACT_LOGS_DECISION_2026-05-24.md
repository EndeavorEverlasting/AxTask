# AxTask Extract Logs Decision

Date: 2026-05-24T00:13:00+00:00

## Decision

`_extract_logs/` is export-only by default.

## Reason

Extraction logs may contain environment-specific details, terminal residue, paths, timestamps, tool output, or accidental sensitive values. Even when a basic grep scan does not reveal secrets, logs are not source code and should not be committed unless manually reviewed and proven useful.

## Handling

- Archive logs into `_rescue_exports/`.
- Generate SHA256 checksums.
- Ignore logs in Git.
- Commit only documentation that proves the rescue state and points to local exports.

## Default Classification

`_extract_logs/`: export-only, not tracked.
