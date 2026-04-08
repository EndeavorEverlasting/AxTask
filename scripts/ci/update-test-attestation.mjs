/**
 * Writes docs/TEST_ATTESTATION.md from GitHub Actions env (push workflows).
 * Safe to run locally with partial env for preview.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const outPath = path.join(root, "docs", "TEST_ATTESTATION.md");

const sha = process.env.GITHUB_SHA || "local";
const ref = process.env.GITHUB_REF_NAME || "unknown";
const serverUrl = (process.env.GITHUB_SERVER_URL || "https://github.com").replace(
  /\/$/,
  "",
);
const repo = process.env.GITHUB_REPOSITORY || "unknown/unknown";
const runId = process.env.GITHUB_RUN_ID || "";

const runUrl =
  runId && serverUrl && repo
    ? `${serverUrl}/${repo}/actions/runs/${runId}`
    : "(not a CI run)";

const generatedAt = new Date().toISOString();

const body = `# Test attestation

This file is updated automatically when the \`test-and-attest\` workflow passes on a push to the default branch.

| Field | Value |
| --- | --- |
| **Commit** | \`${sha}\` |
| **Branch** | \`${ref}\` |
| **Workflow run** | ${runUrl} |
| **Generated at (UTC)** | ${generatedAt} |

`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body, "utf8");
