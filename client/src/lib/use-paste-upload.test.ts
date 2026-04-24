// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ATTACHMENT_IMAGE_MAX_BYTES } from "@shared/attachment-image-limits";
import { __internal } from "./use-paste-upload";

describe("use-paste-upload :: helpers", () => {
  it("isLikelyImageUrl accepts https image URLs", () => {
    expect(__internal.isLikelyImageUrl("https://example.com/a.png")).toBe(true);
    expect(__internal.isLikelyImageUrl("https://example.com/a.jpeg")).toBe(true);
    expect(__internal.isLikelyImageUrl("https://example.com/a.gif?x=1")).toBe(true);
    expect(__internal.isLikelyImageUrl("https://example.com/a.webp#frag")).toBe(true);
  });
  it("isLikelyImageUrl rejects non-https and unusual suffixes", () => {
    expect(__internal.isLikelyImageUrl("http://example.com/a.png")).toBe(false);
    expect(__internal.isLikelyImageUrl("ftp://example.com/a.png")).toBe(false);
    expect(__internal.isLikelyImageUrl("javascript:alert(1)")).toBe(false);
  });
  it("isLikelyImageUrl accepts typical CDN origins without an extension", () => {
    expect(__internal.isLikelyImageUrl("https://media.giphy.com/some/path")).toBe(true);
    expect(__internal.isLikelyImageUrl("https://cdn.example.com/abc")).toBe(true);
  });
  it("sanitizeFilename strips control chars and adds a reasonable extension", () => {
    expect(__internal.sanitizeFilename("hello world!", "image/png")).toBe("hello_world_.png");
    expect(__internal.sanitizeFilename("x".repeat(200), "image/jpeg")).toMatch(/\.jpeg$/);
    expect(__internal.sanitizeFilename("already.png", "image/png")).toBe("already.png");
  });
  it("PASTE_ACCEPTED_MIME is the image allowlist (no svg, no bmp, no tiff)", () => {
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/png")).toBe(true);
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/gif")).toBe(true);
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/jpeg")).toBe(true);
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/webp")).toBe(true);
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/svg+xml")).toBe(false);
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/bmp")).toBe(false);
    expect(__internal.PASTE_ACCEPTED_MIME.has("image/tiff")).toBe(false);
    expect(__internal.PASTE_ACCEPTED_MIME.has("text/html")).toBe(false);
  });
  it("PASTE_IMAGE_BYTE_CAP matches the server scanAttachmentBuffer cap", () => {
    expect(__internal.PASTE_IMAGE_BYTE_CAP).toBe(ATTACHMENT_IMAGE_MAX_BYTES);
  });
});
