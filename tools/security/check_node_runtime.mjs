#!/usr/bin/env node

const ALLOWED_MAJORS = new Set([20, 22]);
const [majorRaw, minorRaw] = process.versions.node.split(".");
const major = Number(majorRaw);
const minor = Number(minorRaw);

if (!Number.isFinite(major) || !Number.isFinite(minor)) {
  console.error("Node runtime guard failed: could not parse Node.js version.");
  process.exit(1);
}

if (!ALLOWED_MAJORS.has(major)) {
  console.error(
    `Node runtime guard failed: Node.js ${process.versions.node} is not an approved LTS runtime.`,
  );
  console.error("Approved major versions: 20.x or 22.x.");
  process.exit(1);
}

if (major === 20 && minor < 16) {
  console.error(
    `Node runtime guard failed: Node.js ${process.versions.node} is below the minimum supported 20.16.x baseline.`,
  );
  process.exit(1);
}

console.log(`Node runtime guard passed (${process.versions.node}).`);
