import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOST_SRC = fs.readFileSync(
  path.resolve(__dirname, "task-list-host.tsx"),
  "utf8",
);
const PAGE_SRC = fs.readFileSync(
  path.resolve(__dirname, "../pages/tasks.tsx"),
  "utf8",
);

describe("TaskListHost :: source contract", () => {
  it("is the component used by /tasks (not legacy TaskList)", () => {
    expect(PAGE_SRC).toContain(
      'import { TaskListHost } from "@/components/task-list-host"',
    );
    expect(PAGE_SRC).toContain("<TaskListHost />");
    expect(PAGE_SRC).not.toMatch(/<TaskList\s*\/>/);
  });

  it("does not import framer-motion or @dnd-kit in its own module", () => {
    expect(HOST_SRC).not.toMatch(/from\s+['"]framer-motion['"]/);
    expect(HOST_SRC).not.toMatch(/from\s+['"]@dnd-kit\//);
  });

  it("uses the pretext imperative list controller for rows", () => {
    expect(HOST_SRC).toContain("PretextImperativeList");
    expect(HOST_SRC).toContain('"@/lib/pretext-imperative-list"');
  });

  it("tags itself as the task-list surface for perf accounting", () => {
    expect(HOST_SRC).toContain('usePerfSurface<HTMLDivElement>("task-list")');
  });

  it("lazy-loads write-path components (TaskForm, ClassificationBadge)", () => {
    expect(HOST_SRC).toMatch(/const TaskForm\s*=\s*lazy\(/);
    expect(HOST_SRC).toMatch(/const ClassificationBadge\s*=\s*lazy\(/);
  });

  it("keeps the heavy offline-sync chain out of its static import graph (dynamic import only)", () => {
    expect(HOST_SRC).not.toMatch(/^import\s+\{[^}]*syncDeleteTask/m);
    expect(HOST_SRC).toMatch(/await import\(['"]@\/lib\/task-sync-api['"]\)/);
  });
});
