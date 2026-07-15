# Runtime memory growth analysis

This operator tool consumes the structured `axtask.runtime.memory` records introduced by the bounded runtime-memory diagnostics slice. It groups repeated operation samples by label, ranks the most likely memory domain, and correlates numeric workload metrics with observed growth.

It is read-only. It does not connect to Neon, Render, or the application database.

## Usage

Analyze an exported log file:

```bash
node scripts/analyze-runtime-memory-growth.mjs render.log
```

Read from standard input:

```bash
cat render.log | node scripts/analyze-runtime-memory-growth.mjs
```

Emit machine-readable JSON:

```bash
node scripts/analyze-runtime-memory-growth.mjs --json render.log
```

Raise the minimum sample count for each operation label:

```bash
node scripts/analyze-runtime-memory-growth.mjs --min-samples=8 render.log
```

Ordinary Render lines are allowed in the input. The parser accepts only JSON records whose event is `axtask.runtime.memory` and whose phase is `operation`. Unrelated and malformed lines are counted as ignored.

## Evidence model

The analyzer evaluates four memory domains independently:

| Domain | Meaning |
|---|---|
| `heapUsedMiB` | JavaScript objects managed by V8 |
| `arrayBuffersMiB` | buffers and typed-array backing stores |
| `externalMiB` | memory reported outside the managed JavaScript heap |
| `rssMiB` | total resident process memory not already explained by stronger domain evidence |

For each operation label and domain it records:

- accepted sample count
- positive-growth ratio
- median delta
- total positive delta
- maximum delta
- matching pressure-signal count
- numeric workload correlation when at least five varied samples exist

Workload correlation is reported only when the Pearson coefficient is at least `0.7`. A correlation can strengthen attribution, but it does not establish causation.

## Evidence strength

`strong` requires at least five samples, repeated positive growth, meaningful median and cumulative growth, plus either repeated runtime pressure signals or a strong workload correlation.

`moderate` and `weak` require progressively less evidence. `none` means the accepted samples do not show a consistent repeated-growth pattern.

These levels are deliberately conservative. A single large delta is not promoted to a strong leak candidate.

## Reading the report

Example:

```text
[STRONG] reminders.dispatch -> JavaScript heap
  samples=6 errors=0 positive=6/6
  medianDeltaMiB=2.75 totalPositiveMiB=16.5 maxDeltaMiB=4
  pressureSignals=6 maxHeapUtilizationPercent=9
  workloadCorrelation=scanned r=1 n=6
```

This means repeated reminder-dispatch samples grew the JavaScript heap, and larger scanned workloads tracked larger heap deltas. It does not identify a specific object, closure, library, or source line.

## Proof ceiling

The analyzer can identify a repeated-growth candidate and narrow the likely allocation domain and workload relationship.

Object-level proof still requires an explicit heap or allocation profile captured in a controlled diagnostic window. Do not commit heap snapshots, provider logs, credentials, request bodies, or personal data to the repository.

## Safe operating sequence

1. Merge and deploy the bounded runtime-memory diagnostics only after its CI passes.
2. Observe naturally occurring operations. Do not enable disabled workers solely to manufacture samples.
3. Export a sanitized log window to an ignored local path.
4. Run this analyzer with at least five samples per relevant label.
5. Use strong repeated evidence to choose one controlled profiler or code-review target.
6. Preserve the report's proof ceiling. Do not label a candidate as a confirmed leak without object-level evidence.
