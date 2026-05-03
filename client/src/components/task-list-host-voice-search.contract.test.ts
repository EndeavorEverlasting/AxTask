// @vitest-environment node
/**
 * Voice dictation after `prepare_task_search` stores text in
 * `voiceSearchQuery`; TaskListHost must consume it into `searchQuery`
 * so the list filter matches what the user said.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "task-list-host.tsx"), "utf8");

describe("TaskListHost :: voice search plumbing", () => {
  it("imports useVoiceOptional (safe outside VoiceProvider for tests)", () => {
    expect(src).toMatch(/import\s*\{\s*useVoiceOptional\s*\}\s*from\s*"@\/hooks\/use-voice"/);
  });

  it("consumes voiceSearchQuery into setSearchQuery", () => {
    expect(src).toContain("voiceSearchSignal");
    expect(src).toMatch(/consumeVoiceSearch\(\)/);
    expect(src).toMatch(/setSearchQuery\(q\)/);
  });
});
