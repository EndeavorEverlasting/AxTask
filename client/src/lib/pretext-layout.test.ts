import { describe, expect, it } from "vitest";
import { estimateTextLayout, prepareText, layoutPreparedText } from "./pretext-layout";

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
});
