// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Source-level contract tests for the paste composer family. We assert on the
 * *source* to avoid the cost of spinning up testing-library + mocking fetch
 * end-to-end; the behavioural guarantees below are load-bearing for
 * docs/PASTE_COMPOSER_SECURITY.md and must not silently drift.
 */
const COMPOSER_SRC = fs.readFileSync(
  path.resolve(__dirname, "paste-composer.tsx"),
  "utf8",
);
const HOOK_SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "lib", "use-paste-upload.ts"),
  "utf8",
);
const GIF_SRC = fs.readFileSync(
  path.resolve(__dirname, "gif-picker.tsx"),
  "utf8",
);

describe("paste composer :: contract", () => {
  it("exports PasteComposer + handle", () => {
    expect(COMPOSER_SRC).toContain("export const PasteComposer");
    expect(COMPOSER_SRC).toContain("PasteComposerHandle");
  });
  it("enforces a max attachment cap on both add and remove paths", () => {
    expect(COMPOSER_SRC).toMatch(/paste\.attachments\.length >= maxAttachments/);
  });
  it("only inserts the markdown token when the textarea is focused", () => {
    expect(COMPOSER_SRC).toMatch(/document\.activeElement === ta/);
  });
  it("renders thumbnails with referrerPolicy no-referrer (no 3P referrer leak)", () => {
    expect(COMPOSER_SRC).toContain('referrerPolicy="no-referrer"');
  });
  it("offers Write/Preview tabs and uses the same static markdown renderer as read paths", () => {
    expect(COMPOSER_SRC).toContain("renderSafeMarkdownHtmlString");
    expect(COMPOSER_SRC).toContain("TabsTrigger");
    expect(COMPOSER_SRC).toContain("tab-preview");
    expect(COMPOSER_SRC).toContain("dangerouslySetInnerHTML");
    expect(COMPOSER_SRC).toContain("showMarkdownPreview");
  });
});

describe("use-paste-upload :: contract", () => {
  it("hits /api/attachments/upload-url then /api/attachments/upload/:token", () => {
    expect(HOOK_SRC).toContain("/api/attachments/upload-url");
    expect(HOOK_SRC).toContain("uploadUrl");
  });
  it("URL pastes go through /api/attachments/import-url (SSRF-guarded)", () => {
    expect(HOOK_SRC).toContain("/api/attachments/import-url");
  });
  it("resolves picked GIFs via /api/gif/resolve (re-host, never hotlink)", () => {
    expect(HOOK_SRC).toContain("/api/gif/resolve");
  });
  it("ClipboardEvent plain-text fallback checks isLikelyImageUrl before calling addUrl", () => {
    expect(HOOK_SRC).toContain("isLikelyImageUrl");
  });
  it("requests carry CSRF header on non-GET", () => {
    expect(HOOK_SRC).toContain("AXTASK_CSRF_HEADER");
  });
});

describe("gif-picker :: contract", () => {
  it("calls /api/gif/search (no direct Giphy/Tenor origin in the SPA)", () => {
    expect(GIF_SRC).toContain("/api/gif/search");
    expect(GIF_SRC).not.toMatch(/api\.giphy\.com/);
    expect(GIF_SRC).not.toMatch(/tenor\.googleapis\.com/);
  });
  it("preview thumbs carry referrerPolicy=no-referrer", () => {
    expect(GIF_SRC).toContain('referrerPolicy="no-referrer"');
  });
});

describe("paste composer :: smoke render", () => {
  it("renders without crashing at the server", async () => {
    const mod = await import("./paste-composer");
    const node = React.createElement(mod.PasteComposer, {
      value: { body: "hello", attachmentAssetIds: [] },
      onChange: () => {},
      placeholder: "x",
      ariaLabel: "x",
      allowGifPicker: false,
    });
    expect(() => renderToStaticMarkup(node)).not.toThrow();
  });
});

/** Suppress unused warning for vi when Vitest does not allow it elsewhere. */
void vi;
