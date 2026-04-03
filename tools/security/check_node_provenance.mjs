#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const SHARED_FILE = path.join(ROOT, ".security", "approved-node-provenance.json");
const LOCAL_FILE = path.join(ROOT, ".security", "local-node-provenance.json");

function readEntries(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries;
  } catch {
    return [];
  }
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const nodePath = process.execPath;
const platform = process.platform;
const arch = process.arch;
const version = process.versions.node;
const sha256 = sha256File(nodePath);

const entries = [...readEntries(SHARED_FILE), ...readEntries(LOCAL_FILE)];
const approved = entries.some((entry) =>
  entry &&
  entry.sha256 === sha256 &&
  entry.platform === platform &&
  entry.arch === arch &&
  entry.version === version,
);

if (!approved) {
  console.error("Node provenance guard failed.");
  console.error(`Node path: ${nodePath}`);
  console.error(`Node version: ${version}`);
  console.error(`Platform: ${platform}`);
  console.error(`Arch: ${arch}`);
  console.error(`SHA256: ${sha256}`);
  console.error("");
  console.error("This Node binary is not in the approved fingerprint list.");
  console.error("If this machine is trusted, run:");
  console.error("  npm run security:node-provenance:approve-local");
  console.error("");
  console.error("For team-wide trusted binaries, add fingerprints to:");
  console.error("  .security/approved-node-provenance.json");
  process.exit(1);
}

console.log(`Node provenance guard passed (${version}, ${platform}-${arch}).`);
