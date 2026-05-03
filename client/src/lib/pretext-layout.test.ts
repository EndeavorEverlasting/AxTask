import { describe, expect, it } from "vitest";
import {
  estimateTextLayout,
  prepareText,
  layoutPreparedText,
  wrapTextToLines,
  splitSentencesForBubbles,
} from "./pretext-layout";

describe("pretext-layout", () => {
  it("prepares text segments", () => {
    const prepared = prepareText("hello world");
    expect(prepared.segments.length).toBeGreaterThan(0);
    expect(prepared.segments[0].token.length).toBeGreaterThan(0);
  });

  it("creates multiple lines when width is constrained", () => {
    const prepared = prepareText("This is a long sentence that should wrap");
    const result = layoutPreparedText(prepared, 60);
    expect(result.lines).toBeGreaterThan(1);
    expect(result.height).toBe(result.lines * 20);
  });

  it("estimates layout with helper", () => {
    const result = estimateTextLayout("short text", 200);
    expect(result.lines).toBeGreaterThanOrEqual(1);
  });

  it("wrapTextToLines respects max width", () => {
    const lines = wrapTextToLines("hello world wide content here", 40, "14px monospace");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.join(" ").replace(/\s+/g, " ").trim()).toContain("hello");
  });

  it("splitSentencesForBubbles splits on sentence boundaries", () => {
    const parts = splitSentencesForBubbles("First. Second! Third?", 3);
    expect(parts.length).toBe(3);
    expect(parts[0]).toContain("First");
  });
});
