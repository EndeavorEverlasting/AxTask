import { describe, expect, it } from "vitest";
import {
  isWeekendIso,
  isoDateInRange,
  parseTopicDate,
} from "./topic-parser";

describe("parseTopicDate", () => {
  it("extracts MM/DD/YYYY from a typical deployment chat topic", () => {
    const r = parseTopicDate("NSUH - 4/11/2026");
    expect(r?.isoDate).toBe("2026-04-11");
    expect(r?.rawToken).toBe("4/11/2026");
  });

  it("supports single digit month and day", () => {
    expect(parseTopicDate("Site X - 1/3/2026")?.isoDate).toBe("2026-01-03");
  });

  it("supports dashed MM-DD-YYYY", () => {
    expect(parseTopicDate("Alpha team - 4-11-2026")?.isoDate).toBe("2026-04-11");
  });

  it("supports ISO yyyy-mm-dd anywhere in topic", () => {
    expect(parseTopicDate("deploy 2026-04-11 nsuh")?.isoDate).toBe("2026-04-11");
  });

  it("prefers ISO over other tokens in mixed strings", () => {
    const r = parseTopicDate("nsuh 2026-04-11 alt 5/6/24");
    expect(r?.isoDate).toBe("2026-04-11");
  });

  it("returns null for topics without a date", () => {
    expect(parseTopicDate("NSUH Ops")).toBeNull();
    expect(parseTopicDate("")).toBeNull();
    expect(parseTopicDate(null)).toBeNull();
    expect(parseTopicDate(undefined)).toBeNull();
  });

  it("rejects impossible dates (e.g. 2/30)", () => {
    expect(parseTopicDate("stuff - 2/30/2026")).toBeNull();
    expect(parseTopicDate("stuff - 13/1/2026")).toBeNull();
  });
});

describe("isoDateInRange", () => {
  it("is inclusive on both ends", () => {
    expect(isoDateInRange("2026-04-11", "2026-04-01", "2026-04-30")).toBe(true);
    expect(isoDateInRange("2026-04-01", "2026-04-01", "2026-04-30")).toBe(true);
    expect(isoDateInRange("2026-04-30", "2026-04-01", "2026-04-30")).toBe(true);
  });

  it("respects open-ended bounds", () => {
    expect(isoDateInRange("2026-04-11", undefined, "2026-04-30")).toBe(true);
    expect(isoDateInRange("2026-04-11", "2026-04-01", undefined)).toBe(true);
    expect(isoDateInRange("2026-04-11")).toBe(true);
  });

  it("rejects dates outside bounds", () => {
    expect(isoDateInRange("2026-03-31", "2026-04-01", "2026-04-30")).toBe(false);
    expect(isoDateInRange("2026-05-01", "2026-04-01", "2026-04-30")).toBe(false);
  });
});

describe("isWeekendIso", () => {
  it("detects Saturday (April 11, 2026 is Saturday)", () => {
    expect(isWeekendIso("2026-04-11")).toBe(true);
  });
  it("detects Sunday (April 12, 2026 is Sunday)", () => {
    expect(isWeekendIso("2026-04-12")).toBe(true);
  });
  it("detects weekdays", () => {
    expect(isWeekendIso("2026-04-13")).toBe(false);
    expect(isWeekendIso("2026-04-17")).toBe(false);
  });
});
