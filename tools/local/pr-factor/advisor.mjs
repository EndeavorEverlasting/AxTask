const DEFAULT_SLICE_CHECKS = {
  schema: ["npm test -- shared/study-schema.test.ts"],
  api: ["Add and run targeted server tests for changed route/storage modules."],
  ui: ["npm test -- client/src/lib/study-api.test.ts", "Add/execute UI interaction tests when present."],
  infra: ["node tools/ci/check-pr-file-count.mjs --base origin/main --max-files 300"],
  docs: ["Docs-only sanity pass; verify command examples and paths."],
  tests: ["Run changed test files directly where possible."],
  unknown: ["Manual review required; assign tests based on touched behavior."],
};

export function buildTestAdvice(slices) {
  return slices.map((slice) => {
    const checks = new Set(["npm run check"]);
    for (const bucket of slice.buckets) {
      for (const check of (DEFAULT_SLICE_CHECKS[bucket] || DEFAULT_SLICE_CHECKS.unknown)) checks.add(check);
    }
    return {
      id: slice.id,
      title: slice.title,
      checks: [...checks],
    };
  });
}
