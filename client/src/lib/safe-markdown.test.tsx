// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SafeMarkdown,
  __internal,
  isSafeHref,
  renderSafeMarkdownHtmlString,
} from "./safe-markdown";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** Normalize void tags and whitespace for React vs string HTML parity. */
function normHtml(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/<hr\s+class=/gi, "<hr class=")
    .replace(/<img([^>]*?)\s*\/>/gi, "<img$1>")
    .replace(/<hr\s*\/>/gi, "<hr>")
    .replace(/\s+/g, " ")
    .trim();
}

function expectParity(source: string, extra?: { allowedAttachmentIds?: string[]; allowRemoteImages?: boolean }) {
  const reactHtml = render(
    <SafeMarkdown
      source={source}
      allowedAttachmentIds={extra?.allowedAttachmentIds}
      allowRemoteImages={extra?.allowRemoteImages}
    />,
  );
  const stringHtml = renderSafeMarkdownHtmlString(source, {
    allowedAttachmentIds: extra?.allowedAttachmentIds,
    allowRemoteImages: extra?.allowRemoteImages,
  });
  expect(normHtml(reactHtml)).toBe(normHtml(stringHtml));
}

describe("safe-markdown :: isSafeHref", () => {
  it("accepts https and /api/attachments/ URLs only", () => {
    expect(isSafeHref("https://example.com/a")).toBe(true);
    expect(isSafeHref("/api/attachments/abc/download")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(false);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:image/png;base64,AAA")).toBe(false);
    expect(isSafeHref("ftp://example.com")).toBe(false);
    expect(isSafeHref("  ")).toBe(false);
    expect(isSafeHref("https://example.com/" + "x".repeat(4000))).toBe(false);
  });
});

describe("safe-markdown :: <script> / HTML injection", () => {
  it("does not emit a script tag even if the source contains one", () => {
    const html = render(<SafeMarkdown source={"hello <script>alert(1)</script>"} />);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });
  it("does not interpret raw <img onerror=...> as HTML", () => {
    const html = render(<SafeMarkdown source={`<img src=x onerror="alert(1)">`} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
  it("does not emit inline event handlers as attributes", () => {
    const html = render(<SafeMarkdown source={'<a onclick="x">hi</a>'} />);
    expect(html).not.toMatch(/<a[^>]*onclick/i);
    expect(html).toContain("&lt;a onclick");
  });
  it("escapes script inside fenced code for static HTML path", () => {
    const src = "```\n<script>alert(1)</script>\n```";
    const staticHtml = renderSafeMarkdownHtmlString(src);
    expect(staticHtml).not.toContain("<script");
    expect(staticHtml).toContain("&lt;script&gt;");
    expectParity(src);
  });
});

describe("safe-markdown :: links", () => {
  it("renders https link with noreferrer and no-referrer", () => {
    const html = render(<SafeMarkdown source={"see [docs](https://example.com/p)"} />);
    expect(html).toContain(`href="https://example.com/p"`);
    expect(html).toContain(`rel="noopener noreferrer"`);
    expect(html).toMatch(/referrerPolicy="no-referrer"/i);
  });
  it("renders javascript: link as inert text, not an <a href>", () => {
    const html = render(<SafeMarkdown source={"danger [x](javascript:alert(1))"} />);
    expect(html).not.toContain(`href="javascript:`);
    expect(html).toContain("javascript:alert(1)");
  });
  it("renders data: link as inert text", () => {
    const html = render(<SafeMarkdown source={"[x](data:text/html;base64,AAA)"} />);
    expect(html).not.toContain(`href="data:`);
  });
});

describe("safe-markdown :: images", () => {
  it("resolves attachment:<id> to /api/attachments/<id>/download when id is allowlisted", () => {
    const html = render(
      <SafeMarkdown
        source={"![cat](attachment:abcd1234-feed-face-cafe-d3adb33fcafe)"}
        allowedAttachmentIds={["abcd1234-feed-face-cafe-d3adb33fcafe"]}
      />,
    );
    expect(html).toContain(`src="/api/attachments/abcd1234-feed-face-cafe-d3adb33fcafe/download"`);
    expect(html).toMatch(/referrerPolicy="no-referrer"/i);
    expect(html).toContain(`loading="lazy"`);
  });
  it("refuses to resolve attachment:<id> that is not on the allowlist (XS-user smuggling)", () => {
    const html = render(
      <SafeMarkdown
        source={"![evil](attachment:bad-asset-not-mine)"}
        allowedAttachmentIds={["something-else"]}
      />,
    );
    expect(html).not.toContain("/api/attachments/bad-asset-not-mine");
    expect(html).toContain("attachment:bad-asset-not-mine");
  });
  it("refuses https img by default (CSP posture)", () => {
    const html = render(<SafeMarkdown source={"![x](https://evil.example/pw.png)"} />);
    expect(html).not.toContain("<img");
  });
  it("allows https img only when caller opts in", () => {
    const html = render(
      <SafeMarkdown
        source={"![x](https://example.com/a.png)"}
        allowRemoteImages
      />,
    );
    expect(html).toContain("<img");
    expect(html).toContain(`src="https://example.com/a.png"`);
  });
  it("even with allowRemoteImages, rejects non-https schemes", () => {
    const html = render(
      <SafeMarkdown
        source={"![x](javascript:alert(1))"}
        allowRemoteImages
      />,
    );
    expect(html).not.toContain("<img");
  });
});

describe("safe-markdown :: block / inline", () => {
  it("splits paragraphs on blank lines", () => {
    const blocks = __internal.splitBlocks("a\n\nb\n\nc");
    expect(blocks).toEqual(["a", "b", "c"]);
  });
  it("renders bold / italic / code", () => {
    const html = render(
      <SafeMarkdown source={"hello **world** and *yes* plus `code`"} />,
    );
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<em>yes</em>");
    expect(html).toContain("<code");
  });
  it("parses ATX heading and list", () => {
    const doc = __internal.parseDocument("## Hi\n\n- a\n- **b**");
    expect(doc[0]).toMatchObject({ kind: "heading", level: 2, text: "Hi" });
    expect(doc[1]).toMatchObject({ kind: "list", ordered: false, items: ["a", "**b**"] });
  });
  it("renders thematic break and wraps body", () => {
    const html = render(<SafeMarkdown source={"a\n\n---\n\nb"} />);
    expect(html).toContain('class="axtask-md-body"');
    expect(html).toContain("<hr");
  });
  it("blockquote nests parse", () => {
    const doc = __internal.parseDocument("> line\n> **bold**");
    expect(doc[0]?.kind).toBe("blockquote");
  });
});

describe("safe-markdown :: React vs static HTML parity", () => {
  it("matches for plain paragraph", () => {
    expectParity("hello **x**");
  });
  it("matches for heading + fence + list", () => {
    expectParity("# T\n\n```\n<x>\n```\n\n1. one\n2. two");
  });
  it("matches with allowlist attachment", () => {
    const id = "abcd1234-feed-face-cafe-d3adb33fcafe";
    expectParity(`![i](attachment:${id})`, { allowedAttachmentIds: [id] });
  });
});
