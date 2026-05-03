// @vitest-environment node
/**
 * `prepare_task_search` used to dispatch `axtask-voice-focus-task-search`,
 * which had no listener after `task-list.tsx` was deleted. It must use the
 * same `axtask-focus-task-search` event (and delay) as other find paths.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "use-voice.tsx"), "utf8");

describe("useVoice :: prepare_task_search event contract", () => {
  it("does not dispatch the orphaned axtask-voice-focus-task-search event", () => {
    expect(src).not.toContain("axtask-voice-focus-task-search");
  });

  it("dispatches axtask-focus-task-search after a delay inside prepare_task_search", () => {
    expect(src).toMatch(/case\s+"prepare_task_search"/);
    expect(src).toMatch(
      /setTimeout\([\s\S]*?dispatchEvent\(new Event\("axtask-focus-task-search"\)\)/,
    );
  });
});
