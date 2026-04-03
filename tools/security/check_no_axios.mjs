#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["client", "server", "shared"];
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "docs"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const AXIOS_USAGE = /(from\s+['"]axios['"]|require\(\s*['"]axios['"]\s*\)|\baxios\.)/i;

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    acc.push(path.join(dir, entry.name));
  }
}

const offenders = [];
const sourceFiles = [];
for (const relDir of SOURCE_DIRS) {
  walk(path.join(ROOT, relDir), sourceFiles);
}

for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, "utf8");
  if (AXIOS_USAGE.test(content)) {
    offenders.push(path.relative(ROOT, filePath));
  }
}

const packageJsonPath = path.join(ROOT, "package.json");
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const depSets = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies];
  const hasAxios = depSets.some((deps) => deps && Object.prototype.hasOwnProperty.call(deps, "axios"));
  if (hasAxios) offenders.push("package.json (direct dependency: axios)");
}

if (offenders.length > 0) {
  console.error("Security policy violation: axios usage/dependency detected.");
  for (const offender of offenders) {
    console.error(` - ${offender}`);
  }
  console.error("Use native fetch instead of axios.");
  process.exit(1);
}

console.log("Axios guard passed.");
