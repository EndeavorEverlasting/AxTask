#!/usr/bin/env node
/**
 * Rewrites docs/TEST_ATTESTATION.md with run metadata (called from CI after tests pass).
 * Env: GITHUB_SHA, GITHUB_REF_NAME, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const target = join(root, "docs", "TEST_ATTESTATION.md");

const sha = process.env.GITHUB_SHA || "unknown";
const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF?.replace(/^refs\/heads\//, "") || "unknown";
const server = (process.env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/, "");
const repo = process.env.GITHUB_REPOSITORY || "";
const runId = process.env.GITHUB_RUN_ID || "";
const runUrl = runId && repo ? `${server}/${repo}/actions/runs/${runId}` : "—";

const verifiedAt = new Date().toISOString();

const body = `# Test attestation (CI)

<!--
  AUTO-GENERATED FILE — do not edit by hand.
  Updated by \`.github/workflows/test-and-attest.yml\` when tests pass on the default branch.
-->

| Field | Value |
|--------|--------|
| **Status** | Passed |
| **Commit SHA** | \`${sha}\` |
| **Ref** | \`${ref}\` |
| **Verified at (UTC)** | ${verifiedAt} |
| **Workflow run** | ${runUrl === "—" ? "—" : `[Run #${runId}](${runUrl})`} |

When green, this row documents the **latest commit on the default branch** for which \`npm test\` completed successfully in GitHub Actions. It is a **receipt**, not a substitute for running tests locally before you push.
`;

writeFileSync(target, body, "utf8");
console.log("[update-test-attestation] Wrote", target);
