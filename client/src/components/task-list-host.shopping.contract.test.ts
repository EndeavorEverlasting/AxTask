// @vitest-environment node
/**
 * Contract tests for TaskListHost's `variant="shopping"` switch.
 *
 * We keep the prefilter predicate exported as a pure function so
 * `/shopping`'s behavior (only shopping-classified tasks appear, plus
 * heuristic matches from `isShoppingTask`) can be asserted without
 * spinning up jsdom + React Query. The jsdom regression tests in
 * task-list-host.render.test.tsx already exercise the mounted UI.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyVariantPrefilter } from "./task-list-host";

type PrefilterTask = {
  id: string;
  classification: string;
  activity: string;
  notes?: string | null;
};

const samples: PrefilterTask[] = [
  { id: "a", classification: "Shopping", activity: "Milk" },
  { id: "b", classification: "Work", activity: "Write report" },
  { id: "c", classification: "General", activity: "pick up groceries" },
  { id: "d", classification: "General", activity: "email mom" },
  { id: "e", classification: "General", activity: "buy batteries", notes: "AA x4" },
];

describe("TaskListHost :: shopping prefilter", () => {
  it("default variant returns everything unchanged", () => {
    const out = applyVariantPrefilter("default", samples);
    expect(out).toHaveLength(samples.length);
    expect(out).toEqual(samples);
  });

  it("shopping variant keeps classification=Shopping rows", () => {
    const out = applyVariantPrefilter("shopping", samples);
    expect(out.some((t) => t.id === "a")).toBe(true);
  });

  it("shopping variant accepts heuristic matches via isShoppingTask", () => {
    const out = applyVariantPrefilter("shopping", samples);
    /* "pick up groceries" and "buy batteries" are caught by the
     * `/\b(buy|pick up|grocery|...)\b/` heuristic. */
    expect(out.some((t) => t.id === "c")).toBe(true);
    expect(out.some((t) => t.id === "e")).toBe(true);
  });

  it("shopping variant drops plain Work and General non-shopping tasks", () => {
    const out = applyVariantPrefilter("shopping", samples);
    expect(out.some((t) => t.id === "b")).toBe(false);
    expect(out.some((t) => t.id === "d")).toBe(false);
  });

  it("is a pure function — does not mutate the input array", () => {
    const copy = samples.slice();
    applyVariantPrefilter("shopping", copy);
    expect(copy).toEqual(samples);
  });
});

describe("Shopping page wiring", () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const shopping = fs.readFileSync(
    path.join(root, "client", "src", "pages", "shopping.tsx"),
    "utf8",
  );

  it("renders TaskListHost with variant=shopping (not the legacy TaskList)", () => {
    expect(shopping).toContain('TaskListHost variant="shopping"');
    expect(shopping).not.toContain('from "@/components/task-list"');
  });

  it("legacy task-list.tsx has been removed from the tree", () => {
    const legacy = path.join(
      root,
      "client",
      "src",
      "components",
      "task-list.tsx",
    );
    expect(fs.existsSync(legacy)).toBe(false);
  });
});
