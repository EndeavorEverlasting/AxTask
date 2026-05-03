#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const LOCAL_FILE = path.join(ROOT, ".security", "local-node-provenance.json");

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function loadLocal() {
  if (!fs.existsSync(LOCAL_FILE)) return { description: "Local trusted Node.js fingerprints for this workstation.", entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    return parsed;
  } catch {
    return { description: "Local trusted Node.js fingerprints for this workstation.", entries: [] };
  }
}

const nodePath = process.execPath;
const entry = {
  label: process.env.COMPUTERNAME || process.env.HOSTNAME || "local-workstation",
  version: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  sha256: sha256File(nodePath),
  path: nodePath,
  addedAt: new Date().toISOString(),
};

const local = loadLocal();
const exists = local.entries.some((e) =>
  e.sha256 === entry.sha256 &&
  e.version === entry.version &&
  e.platform === entry.platform &&
  e.arch === entry.arch,
);

if (!exists) {
  local.entries.push(entry);
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(local, null, 2));
}

console.log("Local Node provenance approved for this workstation.");
console.log(`Version: ${entry.version}`);
console.log(`SHA256: ${entry.sha256}`);
console.log(`File: ${LOCAL_FILE}`);
