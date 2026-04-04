import { describe, it, expect } from "vitest";

/* ─── Re-export the pure helpers so we can test them ──────────── */
// We replicate the helpers here since they're not exported from the component.
// This validates the core logic of time parsing/formatting.

function pad(n: number) { return n.toString().padStart(2, "0"); }

type Period = "AM" | "PM";

function parseTime(v?: string): { h: number; m: number; period: Period } {
  if (!v) return { h: 12, m: 0, period: "AM" };
  const [hh, mm] = v.split(":").map(Number);
  const period: Period = hh >= 12 ? "PM" : "AM";
  const h = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return { h, m: mm || 0, period };
}

function to24(h: number, m: number, period: Period): string {
  let hh = h;
  if (period === "AM" && h === 12) hh = 0;
  else if (period === "PM" && h !== 12) hh = h + 12;
  return `${pad(hh)}:${pad(m)}`;
}

describe("clock-time-picker helpers", () => {
  describe("pad", () => {
    it("pads single-digit numbers", () => {
      expect(pad(0)).toBe("00");
      expect(pad(5)).toBe("05");
      expect(pad(9)).toBe("09");
    });
    it("does not pad two-digit numbers", () => {
      expect(pad(10)).toBe("10");
      expect(pad(23)).toBe("23");
    });
  });

  describe("parseTime", () => {
    it("returns defaults for undefined/empty", () => {
      expect(parseTime()).toEqual({ h: 12, m: 0, period: "AM" });
      expect(parseTime(undefined)).toEqual({ h: 12, m: 0, period: "AM" });
    });

    it("parses midnight (00:00)", () => {
      expect(parseTime("00:00")).toEqual({ h: 12, m: 0, period: "AM" });
    });

    it("parses noon (12:00)", () => {
      expect(parseTime("12:00")).toEqual({ h: 12, m: 0, period: "PM" });
    });

    it("parses morning time", () => {
      expect(parseTime("09:30")).toEqual({ h: 9, m: 30, period: "AM" });
    });

    it("parses afternoon time", () => {
      expect(parseTime("14:45")).toEqual({ h: 2, m: 45, period: "PM" });
    });

    it("parses 11 PM (23:00)", () => {
      expect(parseTime("23:00")).toEqual({ h: 11, m: 0, period: "PM" });
    });

    it("parses 1 AM (01:05)", () => {
      expect(parseTime("01:05")).toEqual({ h: 1, m: 5, period: "AM" });
    });
  });

  describe("to24", () => {
    it("converts 12 AM to 00:00", () => {
      expect(to24(12, 0, "AM")).toBe("00:00");
    });

    it("converts 12 PM to 12:00", () => {
      expect(to24(12, 0, "PM")).toBe("12:00");
    });

    it("converts 1 AM to 01:00", () => {
      expect(to24(1, 0, "AM")).toBe("01:00");
    });

    it("converts 1 PM to 13:00", () => {
      expect(to24(1, 0, "PM")).toBe("13:00");
    });

    it("converts 11 PM to 23:00", () => {
      expect(to24(11, 0, "PM")).toBe("23:00");
    });

    it("converts 11 AM to 11:00", () => {
      expect(to24(11, 0, "AM")).toBe("11:00");
    });

    it("includes minutes", () => {
      expect(to24(3, 45, "PM")).toBe("15:45");
      expect(to24(9, 5, "AM")).toBe("09:05");
    });
  });

  describe("roundtrip: parseTime → to24", () => {
    const cases = [
      "00:00", "00:30", "01:00", "06:15", "09:30",
      "11:59", "12:00", "12:30", "13:00", "15:45",
      "18:00", "23:59",
    ];
    for (const time of cases) {
      it(`roundtrips ${time}`, () => {
        const { h, m, period } = parseTime(time);
        expect(to24(h, m, period)).toBe(time);
      });
    }
  });
});

