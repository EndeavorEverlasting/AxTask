#!/usr/bin/env node
/**
 * Analyze structured `axtask.runtime.memory` JSONL records without touching the
 * application database or provider APIs.
 *
 * Usage:
 *   node scripts/analyze-runtime-memory-growth.mjs render.log
 *   cat render.log | node scripts/analyze-runtime-memory-growth.mjs
 *   node scripts/analyze-runtime-memory-growth.mjs --json render.log
 *
 * The analyzer ranks repeated growth candidates by operation label and memory
 * domain. It is evidence aggregation, not an object-level heap profiler.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const ANALYSIS_SCHEMA_VERSION = "axtask.runtime-memory-growth-analysis.v1";

const DOMAIN_CONFIG = Object.freeze({
  heapUsedMiB: { signal: "heap-growth", display: "JavaScript heap" },
  arrayBuffersMiB: { signal: "array-buffer-growth", display: "array buffers" },
  externalMiB: { signal: "external-growth", display: "external/native memory" },
  rssMiB: { signal: "rss-unattributed-growth", display: "unattributed RSS" },
});

const STRENGTH_ORDER = Object.freeze({ strong: 3, moderate: 2, weak: 1, none: 0 });

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function pearsonCorrelation(xs, ys) {
  if (xs.length !== ys.length || xs.length < 5) return null;
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let xSquares = 0;
  let ySquares = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const xDelta = xs[index] - xMean;
    const yDelta = ys[index] - yMean;
    numerator += xDelta * yDelta;
    xSquares += xDelta ** 2;
    ySquares += yDelta ** 2;
  }
  if (xSquares === 0 || ySquares === 0) return null;
  return numerator / Math.sqrt(xSquares * ySquares);
}

function extractJsonCandidate(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return trimmed;
  const marker = trimmed.indexOf('{"event":"axtask.runtime.memory"');
  return marker >= 0 ? trimmed.slice(marker) : null;
}

export function parseMemoryRecordLine(line) {
  const candidate = extractJsonCandidate(line);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (
      parsed?.event !== "axtask.runtime.memory" ||
      parsed?.phase !== "operation" ||
      typeof parsed?.label !== "string" ||
      !parsed.label.trim() ||
      !parsed?.delta ||
      typeof parsed.delta !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseMemoryRecords(text) {
  const records = [];
  let ignoredLines = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = parseMemoryRecordLine(line);
    if (record) records.push(record);
    else ignoredLines += 1;
  }
  return { records, ignoredLines };
}

function numericMetrics(record) {
  if (!record?.metrics || typeof record.metrics !== "object") return {};
  const output = {};
  for (const [key, value] of Object.entries(record.metrics)) {
    const number = finiteNumber(value);
    if (number !== null) output[key] = number;
  }
  return output;
}

function summarizeDomain(samples, domain, signal) {
  const deltas = samples
    .map((sample) => finiteNumber(sample?.delta?.[domain]))
    .filter((value) => value !== null);
  const positive = deltas.filter((value) => value > 0);
  const signalCount = samples.filter((sample) =>
    Array.isArray(sample.pressureSignals) && sample.pressureSignals.includes(signal),
  ).length;
  const positiveRatio = deltas.length > 0 ? positive.length / deltas.length : 0;
  const medianDeltaMiB = round(median(deltas));
  const totalPositiveMiB = round(positive.reduce((sum, value) => sum + value, 0));
  const maxDeltaMiB = round(deltas.length > 0 ? Math.max(...deltas) : 0);

  return {
    samples: deltas.length,
    positiveSamples: positive.length,
    positiveRatio: round(positiveRatio),
    medianDeltaMiB,
    totalPositiveMiB,
    maxDeltaMiB,
    pressureSignalCount: signalCount,
  };
}

function summarizeCorrelations(samples, domain) {
  const metricKeys = new Set();
  for (const sample of samples) {
    for (const key of Object.keys(numericMetrics(sample))) metricKeys.add(key);
  }

  const correlations = [];
  for (const key of metricKeys) {
    const xs = [];
    const ys = [];
    for (const sample of samples) {
      const metricValue = numericMetrics(sample)[key];
      const deltaValue = finiteNumber(sample?.delta?.[domain]);
      if (metricValue === undefined || deltaValue === null) continue;
      xs.push(metricValue);
      ys.push(deltaValue);
    }
    const correlation = pearsonCorrelation(xs, ys);
    if (correlation !== null && correlation >= 0.7) {
      correlations.push({
        metric: key,
        correlation: round(correlation),
        samples: xs.length,
      });
    }
  }

  return correlations.sort((a, b) => b.correlation - a.correlation);
}

function evidenceStrength(stats, correlations, totalSamples) {
  if (
    totalSamples >= 5 &&
    stats.positiveRatio >= 0.8 &&
    stats.medianDeltaMiB >= 1 &&
    stats.totalPositiveMiB >= 8 &&
    (stats.pressureSignalCount >= 2 || correlations.length > 0)
  ) {
    return "strong";
  }
  if (
    totalSamples >= 4 &&
    stats.positiveRatio >= 0.65 &&
    stats.medianDeltaMiB >= 0.5 &&
    stats.totalPositiveMiB >= 4
  ) {
    return "moderate";
  }
  if (
    totalSamples >= 3 &&
    stats.positiveRatio >= 0.5 &&
    stats.totalPositiveMiB >= 2
  ) {
    return "weak";
  }
  return "none";
}

function summarizeLabel(label, samples) {
  const domains = Object.entries(DOMAIN_CONFIG).map(([domain, config]) => {
    const stats = summarizeDomain(samples, domain, config.signal);
    const correlations = summarizeCorrelations(samples, domain);
    return {
      domain,
      display: config.display,
      strength: evidenceStrength(stats, correlations, samples.length),
      supportScore: stats.pressureSignalCount + correlations.length,
      stats,
      correlations,
    };
  });

  domains.sort((a, b) => {
    const strengthDelta = STRENGTH_ORDER[b.strength] - STRENGTH_ORDER[a.strength];
    if (strengthDelta !== 0) return strengthDelta;
    const supportDelta = b.supportScore - a.supportScore;
    if (supportDelta !== 0) return supportDelta;
    return b.stats.totalPositiveMiB - a.stats.totalPositiveMiB;
  });

  const strongest = domains[0];
  const maxHeapUsedPercentOfLimit = round(
    Math.max(
      0,
      ...samples
        .map((sample) => finiteNumber(sample?.after?.heapUsedPercentOfLimit))
        .filter((value) => value !== null),
    ),
  );

  return {
    label,
    samples: samples.length,
    errors: samples.filter((sample) => sample.outcome === "error").length,
    strongestDomain: strongest.domain,
    strongestDomainDisplay: strongest.display,
    strength: strongest.strength,
    maxHeapUsedPercentOfLimit,
    domainEvidence: domains,
  };
}

export function analyzeMemoryRecords(records, options = {}) {
  const requestedMinSamples = Number(options.minSamples ?? 3);
  const minSamples = Number.isFinite(requestedMinSamples) && requestedMinSamples >= 1
    ? Math.floor(requestedMinSamples)
    : 3;
  const groups = new Map();
  for (const record of records) {
    if (!record || typeof record.label !== "string") continue;
    const group = groups.get(record.label) ?? [];
    group.push(record);
    groups.set(record.label, group);
  }

  const labels = [...groups.entries()]
    .filter(([, samples]) => samples.length >= minSamples)
    .map(([label, samples]) => summarizeLabel(label, samples))
    .sort((a, b) => {
      const strengthDelta = STRENGTH_ORDER[b.strength] - STRENGTH_ORDER[a.strength];
      if (strengthDelta !== 0) return strengthDelta;
      return b.samples - a.samples;
    });

  const counts = { strong: 0, moderate: 0, weak: 0, none: 0 };
  for (const label of labels) counts[label.strength] += 1;

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    inputRecords: records.length,
    minSamples,
    labelCounts: counts,
    labels,
    proofCeiling:
      "Repeated-growth attribution only. Object-level proof requires an explicit heap or allocation profile outside this analyzer.",
  };
}

export function renderEnglishReport(analysis, metadata = {}) {
  const lines = [
    "AXTASK RUNTIME MEMORY GROWTH ANALYSIS",
    `Records: ${analysis.inputRecords} accepted / ${metadata.ignoredLines ?? 0} ignored`,
    `Minimum samples per label: ${analysis.minSamples}`,
    "",
  ];

  if (analysis.labels.length === 0) {
    lines.push("No operation label had enough accepted samples.");
  }

  for (const label of analysis.labels) {
    const strongest = label.domainEvidence[0];
    lines.push(
      `[${label.strength.toUpperCase()}] ${label.label} -> ${label.strongestDomainDisplay}`,
      `  samples=${label.samples} errors=${label.errors} positive=${strongest.stats.positiveSamples}/${strongest.stats.samples}`,
      `  medianDeltaMiB=${strongest.stats.medianDeltaMiB} totalPositiveMiB=${strongest.stats.totalPositiveMiB} maxDeltaMiB=${strongest.stats.maxDeltaMiB}`,
      `  pressureSignals=${strongest.stats.pressureSignalCount} maxHeapUsedPercentOfLimit=${label.maxHeapUsedPercentOfLimit}`,
    );
    const correlation = strongest.correlations[0];
    if (correlation) {
      lines.push(
        `  metricCorrelation=${correlation.metric} r=${correlation.correlation} n=${correlation.samples}`,
      );
    }
  }

  lines.push(
    "",
    `Result: ${analysis.labelCounts.strong} strong / ${analysis.labelCounts.moderate} moderate / ${analysis.labelCounts.weak} weak / ${analysis.labelCounts.none} none`,
    `Proof ceiling: ${analysis.proofCeiling}`,
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  let json = false;
  let minSamples = 3;
  let file = null;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg.startsWith("--min-samples=")) {
      minSamples = Number(arg.slice("--min-samples=".length));
    } else if (!file) file = arg;
  }
  return { help: false, json, minSamples, file };
}

async function readStdin() {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) buffer += chunk;
  return buffer;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Analyze AxTask structured runtime-memory JSONL records.

Usage:
  node scripts/analyze-runtime-memory-growth.mjs [--json] [--min-samples=N] [log-file]
  cat render.log | node scripts/analyze-runtime-memory-growth.mjs

The input may include ordinary Render lines; only axtask.runtime.memory operation records are accepted.`);
    return;
  }

  const text = args.file ? fs.readFileSync(args.file, "utf8") : await readStdin();
  const parsed = parseMemoryRecords(text);
  const analysis = analyzeMemoryRecords(parsed.records, { minSamples: args.minSamples });
  if (args.json) {
    console.log(JSON.stringify({ ...analysis, ignoredLines: parsed.ignoredLines }, null, 2));
  } else {
    console.log(renderEnglishReport(analysis, { ignoredLines: parsed.ignoredLines }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
