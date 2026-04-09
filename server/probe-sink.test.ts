// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyScannerProbeFamily,
  isScannerProbePath,
  normalizeUrlPath,
} from "./probe-sink";

describe("normalizeUrlPath", () => {
  it("collapses double slashes from logs", () => {
    expect(normalizeUrlPath("//wordpress/wp-includes/wlwmanifest.xml")).toBe(
      "/wordpress/wp-includes/wlwmanifest.xml",
    );
    expect(normalizeUrlPath("//wp/wp-includes/wlwmanifest.xml")).toBe("/wp/wp-includes/wlwmanifest.xml");
  });

  it("strips query and hash", () => {
    expect(normalizeUrlPath("/api/foo?x=1")).toBe("/api/foo");
    expect(normalizeUrlPath("/path#frag")).toBe("/path");
  });

  it("handles root", () => {
    expect(normalizeUrlPath("/")).toBe("/");
    expect(normalizeUrlPath("")).toBe("/");
  });
});

describe("isScannerProbePath", () => {
  const probes: string[] = [
    "/wp-admin/setup-config.php",
    "/wordpress/wp-admin/setup-config.php",
    "/wp-admin/install.php",
    "/wordpress/wp-includes/wlwmanifest.xml",
    "/website/wp-includes/wlwmanifest.xml",
    "/news/wp-includes/wlwmanifest.xml",
    "/shop/wp-includes/wlwmanifest.xml",
    "/2018/wp-includes/wlwmanifest.xml",
    "/media/wp-includes/wlwmanifest.xml",
    "/cms/wp-includes/wlwmanifest.xml",
    "/sito/wp-includes/wlwmanifest.xml",
    "/wp/wp-includes/wlwmanifest.xml",
    "/wp1/wp-includes/wlwmanifest.xml",
    "/wp2/wp-includes/wlwmanifest.xml",
    "/test/wp-includes/wlwmanifest.xml",
    "/xmlrpc.php",
    "/blog/xmlrpc.php",
    "/wp-login.php",
    "/wp-content/themes/foo/style.css",
    "/wordpress/wp-admin/install.php",
  ];

  it.each(probes)("treats %s as probe", (p) => {
    expect(isScannerProbePath(normalizeUrlPath(p))).toBe(true);
  });

  const notProbes: string[] = [
    "/",
    "/login",
    "/api/auth/config",
    "/api/auth/google/login",
    "/assets/index-abc.js",
    "/branding/axtask-logo.png",
    "/icons/icon-192.svg",
    "/manifest.webmanifest",
    "/service-worker.js",
    "/robots.txt",
    "/sitemap.xml",
    "/health",
    "/ready",
  ];

  it.each(notProbes)("does not treat %s as probe", (p) => {
    expect(isScannerProbePath(normalizeUrlPath(p))).toBe(false);
  });
});

describe("classifyScannerProbeFamily", () => {
  it.each([
    ["/wp-admin/setup-config.php", "wordpress_wp_admin"],
    ["/wordpress/wp-includes/wlwmanifest.xml", "wordpress_wlwmanifest"],
    ["/news/wp-includes/wlwmanifest.xml", "wordpress_wlwmanifest"],
    ["/xmlrpc.php", "wordpress_xmlrpc"],
    ["/blog/xmlrpc.php", "wordpress_xmlrpc"],
    ["/wp-login.php", "wordpress_wp_login"],
    ["/wp-content/themes/foo/style.css", "wordpress_wp_content"],
    ["/wordpress/wp-admin/install.php", "wordpress_prefix"],
  ] as const)("classifies %s as %s", (path, family) => {
    expect(classifyScannerProbeFamily(normalizeUrlPath(path))).toBe(family);
  });
});
