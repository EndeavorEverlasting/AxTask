function matchBucket(file, config) {
  const normalized = file.replace(/\\/g, "/");
  const rules = config.bucketRules || [];
  for (const rule of rules) {
    const hasPrefix = (rule.prefixes || []).some((prefix) => normalized.startsWith(prefix));
    const hasSuffix = (rule.globSuffixes || []).some((suffix) => normalized.endsWith(suffix));
    if (hasPrefix || hasSuffix) return rule.bucket;
  }
  return "unknown";
}

function confidenceFor(bucket) {
  if (bucket === "unknown") return 0.3;
  return 0.9;
}

export function classifyScan(scanData, config) {
  const fileClassifications = scanData.files.map((row) => {
    const bucket = matchBucket(row.file, config);
    const confidence = confidenceFor(bucket);
    return {
      file: row.file,
      bucket,
      confidence,
      rationale: bucket === "unknown"
        ? "No prefix/suffix bucket rule matched."
        : `Matched bucket rule: ${bucket}`,
      stats: { added: row.added, deleted: row.deleted },
      needsSplit: false,
    };
  });

  const byBucket = {};
  for (const row of fileClassifications) {
    byBucket[row.bucket] = (byBucket[row.bucket] || 0) + 1;
  }
  const lowConfidence = fileClassifications.filter((row) => row.confidence < 0.5).map((row) => row.file);

  return {
    generatedAt: new Date().toISOString(),
    baseRef: scanData.baseRef,
    changedFileCount: scanData.changedFileCount,
    byBucket,
    lowConfidence,
    files: fileClassifications,
  };
}
