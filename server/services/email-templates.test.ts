// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAxTaskEmailLayout,
  buildOtpEmail,
  buildPasswordResetEmail,
  escapeHtml,
  plainTextFromHtml,
} from "./email-templates";

describe("escapeHtml", () => {
  it("escapes the five XSS-critical characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("is safe for full payload strings", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("coerces non-string inputs", () => {
    expect(escapeHtml(123 as unknown as string)).toBe("123");
  });
});

describe("buildAxTaskEmailLayout", () => {
  const html = buildAxTaskEmailLayout({
    preheader: "A short preview line.",
    heading: "Branded heading",
    bodyHtml: `<p>Body content</p>`,
    footerNote: "Small footer note.",
  });

  it("returns a full HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("</html>");
  });

  it("embeds the AxTask brand wordmark", () => {
    expect(html).toContain("AxTask");
  });

  it("includes a hidden preheader span for inbox previews", () => {
    expect(html).toMatch(
      /<span[^>]*display:none[^>]*>\s*A short preview line\.\s*<\/span>/,
    );
  });

  it("does not reference external resources or web fonts", () => {
    // External HTTP references + <link href=...> are a no-go for inbox clients.
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/src\s*=/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/fonts\.googleapis\.com/i);
  });

  it("escapes heading and footer content", () => {
    const x = buildAxTaskEmailLayout({
      preheader: "p",
      heading: "<h1>",
      bodyHtml: "<p>body</p>",
      footerNote: "a & b",
    });
    expect(x).toContain("&lt;h1&gt;");
    expect(x).toContain("a &amp; b");
  });
});

describe("buildOtpEmail", () => {
  it("returns subject + html + text with AxTask branding and the code", () => {
    const msg = buildOtpEmail({ code: "123456" });
    expect(msg.subject).toBe("Your AxTask verification code");
    expect(msg.html).toContain("AxTask");
    expect(msg.html).toContain("123456");
    expect(msg.text).toContain("AxTask verification code");
    expect(msg.text).toContain("123456");
  });

  it("shows the purpose when provided, escaped", () => {
    const msg = buildOtpEmail({
      code: "654321",
      purpose: "account:verify_phone",
    });
    expect(msg.html).toContain("account:verify_phone");
  });

  it("escapes malicious code values in HTML (but keeps the raw value in plain text)", () => {
    const msg = buildOtpEmail({ code: "<script>" });
    expect(msg.html).toContain("&lt;script&gt;");
    expect(msg.html).not.toContain("<script>");
    expect(msg.text).toContain("<script>");
  });

  it("does not echo the code in the preheader (keeps it out of inbox previews)", () => {
    const msg = buildOtpEmail({ code: "999999" });
    const preheader = msg.html.match(
      /<span[^>]*display:none[^>]*>([\s\S]*?)<\/span>/,
    )?.[1];
    expect(preheader).toBeTruthy();
    expect(preheader).not.toContain("999999");
  });
});

describe("buildPasswordResetEmail", () => {
  it("returns a branded message with the reset URL", () => {
    const msg = buildPasswordResetEmail({
      resetUrl: "https://example.com/?reset_token=abc",
    });
    expect(msg.subject).toBe("Reset your AxTask password");
    expect(msg.html).toContain("AxTask");
    expect(msg.html).toContain("https://example.com/?reset_token=abc");
    expect(msg.text).toContain("https://example.com/?reset_token=abc");
  });

  it("escapes the reset URL in HTML", () => {
    const msg = buildPasswordResetEmail({
      resetUrl: `https://example.com/?t="><script>alert(1)</script>`,
    });
    expect(msg.html).not.toContain("<script>alert(1)</script>");
    expect(msg.html).toContain("&lt;script&gt;");
  });
});

describe("plainTextFromHtml", () => {
  it("strips tags and decodes entities", () => {
    const out = plainTextFromHtml("<p>Hello <strong>world</strong></p>");
    expect(out).toContain("Hello");
    expect(out).toContain("world");
    expect(out).not.toContain("<");
  });

  it("removes <script> and <style> blocks", () => {
    const out = plainTextFromHtml(
      "<style>.x{}</style><script>alert(1)</script><p>body</p>",
    );
    expect(out).toContain("body");
    expect(out).not.toContain("alert");
    expect(out).not.toContain(".x{}");
  });
});
