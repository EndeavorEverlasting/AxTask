export function planSlices(classificationData, options, config) {
  const maxFiles = options.maxFiles;
  const priorityOrder = config.priorityOrder || ["schema", "api", "ui", "infra", "docs", "tests", "unknown"];
  const byBucket = new Map();
  for (const row of classificationData.files) {
    const bucket = row.bucket || "unknown";
    const list = byBucket.get(bucket) || [];
    list.push(row.file);
    byBucket.set(bucket, list);
  }

  const slices = [];
  let idx = 1;
  for (const bucket of priorityOrder) {
    const files = (byBucket.get(bucket) || []).slice().sort();
    if (files.length === 0) continue;
    for (let i = 0; i < files.length; i += maxFiles) {
      const chunk = files.slice(i, i + maxFiles);
      slices.push({
        id: `part-${idx}`,
        title: `${bucket.toUpperCase()} slice ${i === 0 ? 1 : Math.floor(i / maxFiles) + 1}`,
        buckets: [bucket],
        files: chunk,
        count: chunk.length,
      });
      idx += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    maxFiles,
    totalFiles: classificationData.files.length,
    sliceCount: slices.length,
    slices,
  };
}
