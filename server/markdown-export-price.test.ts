// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isPaidMarkdownExportProduct,
  markdownTaskExportCoinPrice,
} from "./markdown-export-price";

describe("markdown export pricing", () => {
  it("steps freemium price down by export-efficiency level", () => {
    expect(markdownTaskExportCoinPrice(5, 0, false)).toBe(5);
    expect(markdownTaskExportCoinPrice(5, 1, false)).toBe(4);
    expect(markdownTaskExportCoinPrice(5, 5, false)).toBe(0);
    expect(markdownTaskExportCoinPrice(5, 9, false)).toBe(0);
  });

  it("zeros price for paid AxTask or bundle product", () => {
    expect(markdownTaskExportCoinPrice(5, 0, true)).toBe(0);
  });

  it("detects paid products from entitlements list", () => {
    expect(isPaidMarkdownExportProduct(["axtask"])).toBe(true);
    expect(isPaidMarkdownExportProduct(["bundle"])).toBe(true);
    expect(isPaidMarkdownExportProduct(["nodeweaver"])).toBe(false);
    expect(isPaidMarkdownExportProduct([])).toBe(false);
  });
});
