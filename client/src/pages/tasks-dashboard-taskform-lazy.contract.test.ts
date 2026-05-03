// @vitest-environment node
/**
 * Pass-4: TaskForm is heavy; high-traffic pages must not static-import it.
 * Lazy + Suspense defers the chunk until first paint (dashboard) or until
 * the user opens the form (tasks).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = __dirname;
const componentsDir = path.join(__dirname, "..", "components");

const tasksSrc = fs.readFileSync(path.join(pagesDir, "tasks.tsx"), "utf8");
const dashboardSrc = fs.readFileSync(path.join(pagesDir, "dashboard.tsx"), "utf8");
const calendarSrc = fs.readFileSync(
  path.join(componentsDir, "task-calendar.tsx"),
  "utf8",
);

describe("TaskForm lazy-load contract (pass-4)", () => {
  it("tasks.tsx does not static-import TaskForm", () => {
    expect(tasksSrc).not.toMatch(
      /^import\s*\{\s*TaskForm\s*\}\s*from\s*"@\/components\/task-form"/m,
    );
    expect(tasksSrc).toMatch(
      /const\s+TaskForm\s*=\s*lazy\([\s\S]*?import\("@\/components\/task-form"\)/,
    );
    expect(tasksSrc).toMatch(/<Suspense[\s\S]*?<TaskForm\s/);
  });

  it("dashboard.tsx does not static-import TaskForm", () => {
    expect(dashboardSrc).not.toMatch(
      /^import\s*\{\s*TaskForm\s*\}\s*from\s*"@\/components\/task-form"/m,
    );
    expect(dashboardSrc).toMatch(
      /const\s+TaskForm\s*=\s*lazy\([\s\S]*?import\("@\/components\/task-form"\)/,
    );
    expect(dashboardSrc).toMatch(/<Suspense[\s\S]*?<TaskForm\s/);
  });

  it("task-calendar.tsx does not static-import TaskForm", () => {
    expect(calendarSrc).not.toMatch(
      /^import\s*\{\s*TaskForm\s*\}\s*from\s*"\.\/task-form"/m,
    );
    expect(calendarSrc).toMatch(
      /const\s+TaskForm\s*=\s*lazy\([\s\S]*?import\("\.\/task-form"\)/,
    );
    expect(calendarSrc).toMatch(/<Suspense[\s\S]*?<TaskForm/);
  });
});
