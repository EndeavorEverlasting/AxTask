// @vitest-environment node
/**
 * Static-analysis contract ensuring the clickable-insight flow stays wired up.
 * See docs/FEEDBACK_AVATAR_NUDGES.md for the product expectation: clicking an
 * insight either opens the exact task's edit dialog (via /tasks?task=<id>) or
 * pre-fills the tasks-page search when no task ids are available.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");

function read(p: string): string {
  return fs.readFileSync(path.join(root, p), "utf8");
}

describe("planner insight click wiring", () => {
  const planner = read(path.join("client", "src", "pages", "planner.tsx"));

  it("planner renders insight as a clickable button with handleInsightClick", () => {
    expect(planner).toMatch(/handleInsightClick/);
    expect(planner).toMatch(/onClick=\{\(\)\s*=>\s*handleInsightClick\(insight\)\}/);
  });

  it("planner navigates to /tasks?task=<id> when taskIds are present", () => {
    expect(planner).toMatch(/\/tasks\?task=\$\{encodeURIComponent\(firstId\)\}/);
  });

  it("planner dispatches axtask-focus-task-search as the fallback", () => {
    expect(planner).toContain('new CustomEvent("axtask-focus-task-search"');
    expect(planner).toMatch(/query:\s*fallbackQuery/);
  });

  it("planner insight PatternInsight type exposes taskIds", () => {
    expect(planner).toMatch(/taskIds\?:\s*string\[\]/);
  });

  it("planner merges on-device Markov insights with server patterns", () => {
    expect(planner).toContain("mergedPlannerInsights");
    expect(planner).toContain("markov_local");
  });

  it("planner shows dedicated Grocery / Shopping section", () => {
    expect(planner).toContain("Grocery / Shopping");
    expect(planner).toContain("Open shopping list");
  });

  it("planner has inline shopping tags in task cards", () => {
    expect(planner).toContain("Shopping");
    expect(planner).toMatch(/isShoppingLike\(t\)/);
  });
});

describe("planner page :: CSS-first motion (pass-4)", () => {
  const planner = read(path.join("client", "src", "pages", "planner.tsx"));

  it("does not import framer-motion in the planner page chunk", () => {
    expect(planner).not.toMatch(/from\s["']framer-motion["']/);
  });

  it("keeps timeline card header structurally split from chart body", () => {
    expect(planner).toContain('<CardHeader className="pb-3 border-b');
    expect(planner).toContain('<CardContent className="space-y-3 pt-4">');
  });

  it("uses stable panel shells for planner tiles and insights", () => {
    expect(planner).toContain("data-testid={`planner-insight-shell-${insight.type}`}");
    expect(planner).toMatch(/data-testid=\{`planner-tile-\$\{stat\.filter\}`\}[\s\S]*className="axtask-stable-panel/);
  });
});

describe("tasks page query-param handler", () => {
  const tasks = read(path.join("client", "src", "pages", "tasks.tsx"));
  /* Legacy `task-list.tsx` is gone — both /tasks and /shopping now
   * render `TaskListHost`, so the event-wiring assertions target the
   * host component directly. */
  const taskListHost = read(
    path.join("client", "src", "components", "task-list-host.tsx"),
  );

  it("reads ?task=<id> from the URL on mount", () => {
    expect(tasks).toMatch(/URLSearchParams\(window\.location\.search\)/);
    expect(tasks).toContain('params.get("task")');
  });

  it("fetches the task via GET /api/tasks/:id and dispatches axtask-open-task-edit", () => {
    expect(tasks).toContain("/api/tasks/${pendingTaskId}");
    expect(tasks).toContain('new CustomEvent("axtask-open-task-edit"');
  });

  it("strips the ?task= param after opening to avoid reopen-on-refresh", () => {
    expect(tasks).toMatch(/url\.searchParams\.delete\("task"\)/);
  });

  it("task-list-host listens for axtask-open-task-edit and calls setEditingTask", () => {
    expect(taskListHost).toContain('"axtask-open-task-edit"');
    expect(taskListHost).toMatch(/setEditingTask\(t\)/);
  });

  it("axtask-focus-task-search now seeds the search query with detail.query when provided", () => {
    /* Hybrid plan: without a taskId, the planner pre-fills the search via the
       focus event's detail.query. */
    expect(taskListHost).toMatch(/detail\.query/);
    expect(taskListHost).toMatch(/setSearchQuery\(detail\.query\)/);
  });
});
