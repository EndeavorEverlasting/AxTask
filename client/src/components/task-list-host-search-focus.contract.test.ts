// @vitest-environment node
/**
 * Find (Alt+F / sidebar / voice) dispatches `axtask-focus-task-search`.
 * The handler must focus the visible search input — not only optional
 * `detail.query` — or find feels broken after the pretext migration.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(
  path.resolve(__dirname, "task-list-host.tsx"),
  "utf8",
);

describe("TaskListHost :: find focuses search input", () => {
  it("binds searchInputRef to the task search Input", () => {
    expect(src).toMatch(/const\s+searchInputRef\s*=\s*useRef<HTMLInputElement>/);
    expect(src).toMatch(/ref=\{searchInputRef\}/);
    expect(src).toContain('data-testid="task-search"');
  });

  it("axtask-focus-task-search handler calls focus on the ref", () => {
    expect(src).toMatch(/axtask-focus-task-search/);
    expect(src).toMatch(/searchInputRef\.current\?\.focus/);
  });
});
