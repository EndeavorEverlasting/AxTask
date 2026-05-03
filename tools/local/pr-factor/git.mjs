import { spawnSync } from "node:child_process";

export function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return (result.stdout || "").trim();
}

export function detectBaseRef(override = "") {
  if (override) return override;
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const candidate of candidates) {
    const result = spawnSync("git", ["rev-parse", "--verify", candidate], { encoding: "utf8" });
    if ((result.status ?? 1) === 0) return candidate;
  }
  throw new Error(
    `[pr-factor] Could not detect a valid base ref. Tried: ${candidates.join(", ")}. Use --base <ref>.`,
  );
}

export function getSourceBranch() {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function getMergeBase(baseRef) {
  return runGit(["merge-base", "HEAD", baseRef]);
}

export function changedFiles(baseRef) {
  const mergeBase = getMergeBase(baseRef);
  const raw = runGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`]);
  const tracked = raw
    ? raw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean)
    : [];
  const untrackedRaw = runGit(["ls-files", "--others", "--exclude-standard"]);
  const untracked = untrackedRaw
    ? untrackedRaw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean)
    : [];
  const files = [...new Set([...tracked, ...untracked])];
  return { mergeBase, files };
}

export function changedFileStats(baseRef) {
  const mergeBase = getMergeBase(baseRef);
  const raw = runGit(["diff", "--numstat", "--diff-filter=ACMR", `${mergeBase}...HEAD`]);
  const rows = raw
    ? raw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean)
    : [];
  return rows.map((line) => {
    const [addedRaw, deletedRaw, ...rest] = line.split(/\s+/);
    const file = rest.join(" ");
    const added = addedRaw === "-" ? 0 : Number(addedRaw);
    const deleted = deletedRaw === "-" ? 0 : Number(deletedRaw);
    return { file, added: Number.isFinite(added) ? added : 0, deleted: Number.isFinite(deleted) ? deleted : 0 };
  });
}
