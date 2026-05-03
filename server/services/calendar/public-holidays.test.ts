// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMergedPublicHolidays } from "./public-holidays";

describe("loadMergedPublicHolidays", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("injects Easter Sunday and Monday when upstream omits them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { date: "2026-01-01", localName: "New Year's Day", name: "New Year's Day", countryCode: "US" },
        ],
      })) as unknown as typeof fetch,
    );

    const { holidays, hadUpstreamData } = await loadMergedPublicHolidays("US", [2026]);
    expect(hadUpstreamData).toBe(true);
    const namesByDate = new Map<string, string[]>();
    for (const h of holidays) {
      const arr = namesByDate.get(h.date) ?? [];
      arr.push(h.name);
      namesByDate.set(h.date, arr);
    }
    expect(namesByDate.get("2026-04-05")).toContain("Easter Sunday");
    expect(namesByDate.get("2026-04-06")).toContain("Easter Monday");
  });

  it("does not duplicate Easter Sunday when upstream already lists it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { date: "2026-04-05", localName: "Easter Sunday", name: "Easter Sunday", countryCode: "XX" },
        ],
      })) as unknown as typeof fetch,
    );

    const { holidays } = await loadMergedPublicHolidays("DE", [2026]);
    const sun = holidays.filter((h) => h.date === "2026-04-05" && h.name === "Easter Sunday");
    expect(sun.length).toBe(1);
  });
});
