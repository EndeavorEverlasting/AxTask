# Runtime memory growth analyzer

Date: 2026-07-15

## Summary

Adds a read-only analyzer for the structured runtime-memory records produced by PR #77. The analyzer turns repeated samples into operation-level evidence without adding timers, database writes, provider calls, or production mutations.

## Included

- JSONL and Render-prefixed log parsing
- grouping by operation label
- JavaScript heap, array-buffer, external-memory, and RSS domain ranking
- repeated-growth evidence levels: strong, moderate, weak, and none
- workload-to-memory correlation for numeric workload fields
- English and JSON output
- malformed and unrelated line accounting
- deterministic tests and operator documentation

## Not included

- heap snapshot creation
- allocation profiling
- application schema or migration changes
- new runtime telemetry events
- database or provider access
- automatic production capture

## Usage

```bash
node scripts/analyze-runtime-memory-growth.mjs render.log
node scripts/analyze-runtime-memory-growth.mjs --json --min-samples=5 render.log
```

See `docs/RUNTIME_MEMORY_GROWTH_ANALYSIS.md` for the evidence model and safe operating sequence.

## Rollout

This is a stacked follow-up to PR #77 and should merge only after its base diagnostics slice. Analyze sanitized exported logs from an ignored local path.

## Rollback

Revert this PR. It has no runtime configuration, schema, or persisted-data rollback requirement.

## Proof ceiling

The tool can identify repeated operation-level growth candidates, likely memory domains, and workload correlations. It cannot identify a specific retained object, library, or source line without a controlled heap or allocation profile.
