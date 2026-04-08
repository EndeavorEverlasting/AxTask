import fs from "node:fs";
import path from "node:path";
import { changedFiles, changedFileStats } from "./git.mjs";

function globToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp(`^${withWildcards}$`);
}

function shouldExclude(filePath, excludeRegexes) {
  const normalized = filePath.replace(/\\/g, "/");
  return excludeRegexes.some((rx) => rx.test(normalized));
}

function topLevelBucket(file) {
  return file.includes("/") ? file.split("/")[0] : "(repo-root)";
}

export function collectScan(baseRef, config) {
  const { mergeBase, files } = changedFiles(baseRef);
  const stats = changedFileStats(baseRef);
  const statByFile = new Map(stats.map((row) => [row.file.replace(/\\/g, "/"), row]));
  const excludeRegexes = (config.excludePatterns || []).map(globToRegExp);
  const filtered = files.filter((file) => !shouldExclude(file, excludeRegexes));

  const topLevelCounts = {};
  const fileRows = filtered.map((file) => {
    const normalized = file.replace(/\\/g, "/");
    const bucket = topLevelBucket(normalized);
    topLevelCounts[bucket] = (topLevelCounts[bucket] || 0) + 1;
    const stat = statByFile.get(normalized) || { added: 0, deleted: 0 };
    return {
      file: normalized,
      topLevel: bucket,
      added: stat.added,
      deleted: stat.deleted,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    baseRef,
    mergeBase,
    changedFileCount: filtered.length,
    topLevelCounts,
    files: fileRows,
  };
}

export function ensureOutDir(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
}

export function writeJson(outDir, name, data) {
  const filePath = path.join(outDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return filePath;
}
