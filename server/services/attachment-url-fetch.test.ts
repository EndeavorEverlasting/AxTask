// @vitest-environment node
/**
 * SSRF + paste-composer URL-fetch contract. Exercises the blocklist, redirect
 * revalidation, content-type enforcement, size cap, timeout, and magic-byte
 * resniff with an in-memory fake http client so no real network is touched.
 */
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { URL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UrlFetchError,
  fetchImageByUrl,
  isPrivateAddress,
  parsePublicHttpsUrl,
  assertHostIsPublic,
} from "./attachment-url-fetch";

/* ── Fixture bytes ──────────────────────────────────────────────────────── */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngBytes(extra = 32): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.alloc(extra, 0x11)]);
}

/* ── Fake http plumbing ─────────────────────────────────────────────────── */
type HopScript =
  | {
      kind: "redirect";
      location: string;
      status?: number;
    }
  | {
      kind: "ok";
      contentType?: string;
      body: Buffer;
      status?: number;
      contentLength?: number;
    }
  | {
      kind: "status";
      status: number;
      contentType?: string;
    }
  | {
      kind: "network_error";
      message: string;
    }
  | {
      kind: "hang";
    };

function fakeHttpClient(script: HopScript[]) {
  let idx = 0;
  const seenHosts: string[] = [];
  const factory = (url: URL, onResponse: (res: IncomingMessage) => void) => {
    seenHosts.push(url.hostname);
    const hop = script[idx];
    idx += 1;
    const req = new EventEmitter() as unknown as ClientRequest;
    (req as unknown as { setTimeout: (ms: number, cb: () => void) => void }).setTimeout = (
      ms: number,
      cb: () => void,
    ) => {
      if (hop?.kind === "hang") {
        setTimeout(cb, 1); // fire timeout deterministically.
      }
    };
    (req as unknown as { destroy: (err?: Error) => void }).destroy = (err?: Error) => {
      if (err) req.emit("error", err);
    };

    queueMicrotask(() => {
      if (!hop) {
        req.emit("error", new Error("no hop scripted"));
        return;
      }
      if (hop.kind === "network_error") {
        req.emit("error", new Error(hop.message));
        return;
      }
      if (hop.kind === "hang") {
        return;
      }
      const res = new EventEmitter() as unknown as IncomingMessage;
      (res as unknown as { resume: () => void }).resume = () => {};
      (res as unknown as { destroy: () => void }).destroy = () => {};
      if (hop.kind === "redirect") {
        res.statusCode = hop.status ?? 302;
        res.headers = { location: hop.location };
        onResponse(res);
        return;
      }
      if (hop.kind === "status") {
        res.statusCode = hop.status;
        res.headers = { "content-type": hop.contentType ?? "text/html" };
        onResponse(res);
        queueMicrotask(() => res.emit("end"));
        return;
      }
      res.statusCode = hop.status ?? 200;
      res.headers = {
        "content-type": hop.contentType ?? "image/png",
      };
      if (hop.contentLength !== undefined) {
        (res.headers as Record<string, string>)["content-length"] = String(hop.contentLength);
      } else {
        (res.headers as Record<string, string>)["content-length"] = String(hop.body.length);
      }
      onResponse(res);
      /* Use setImmediate so the outer await in fetchImageByUrl has time to
       * run the synchronous checks (content-type, size) and attach its
       * data/end listeners via readCappedBody before we emit. */
      setImmediate(() => {
        res.emit("data", hop.body);
        res.emit("end");
      });
    });
    return req;
  };
  return { factory, seenHosts };
}

/* ── Resolver helpers ───────────────────────────────────────────────────── */
const PUBLIC_IP = "203.0.2.1"; // not in any blocked range by our list
const FAKE_PUBLIC = async (host: string) => {
  if (host === "public.example") return ["93.184.216.34"]; // example.com
  if (host === "redirect.example") return ["93.184.216.34"];
  return [PUBLIC_IP];
};

afterEach(() => vi.restoreAllMocks());

/* ── Range checks ───────────────────────────────────────────────────────── */
describe("isPrivateAddress", () => {
  it("rejects loopback, private, link-local, and multicast v4", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.5.5",
      "192.168.1.1",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("accepts public v4", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("rejects loopback, link-local, ULA, multicast, and IPv4-mapped private v6", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd00::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "2001:db8::1",
      "64:ff9b::1.2.3.4",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("accepts public v6", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});

/* ── URL parsing ────────────────────────────────────────────────────────── */
describe("parsePublicHttpsUrl", () => {
  it("rejects non-https protocols", () => {
    for (const bad of [
      "http://example.com/a.png",
      "ftp://example.com/a.png",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:image/png;base64,AAA",
      "gopher://example.com/",
    ]) {
      expect(() => parsePublicHttpsUrl(bad)).toThrow(UrlFetchError);
    }
  });

  it("rejects userinfo embedded URLs", () => {
    expect(() => parsePublicHttpsUrl("https://user:pw@example.com/a.png")).toThrow(
      UrlFetchError,
    );
  });

  it("rejects literal private IPv4/IPv6 in the hostname", () => {
    expect(() => parsePublicHttpsUrl("https://127.0.0.1/a.png")).toThrow(UrlFetchError);
    expect(() => parsePublicHttpsUrl("https://[::1]/a.png")).toThrow(UrlFetchError);
    expect(() => parsePublicHttpsUrl("https://[fe80::1]/a.png")).toThrow(UrlFetchError);
  });

  it("accepts a public https URL", () => {
    expect(() => parsePublicHttpsUrl("https://example.com/a.png")).not.toThrow();
  });
});

describe("assertHostIsPublic", () => {
  it("rejects when any A record is private", async () => {
    await expect(
      assertHostIsPublic("mixed.example", async () => ["8.8.8.8", "10.0.0.1"]),
    ).rejects.toBeInstanceOf(UrlFetchError);
  });
  it("rejects when DNS returns no records", async () => {
    await expect(assertHostIsPublic("none.example", async () => [])).rejects.toMatchObject({
      reason: "host_not_resolvable",
    });
  });
  it("accepts when all records are public", async () => {
    await expect(
      assertHostIsPublic("good.example", async () => ["8.8.8.8"]),
    ).resolves.toEqual(["8.8.8.8"]);
  });
});

/* ── fetchImageByUrl behavioural matrix ─────────────────────────────────── */
describe("fetchImageByUrl", () => {
  it("downloads a valid PNG and returns buffer + mime", async () => {
    const png = pngBytes();
    const { factory, seenHosts } = fakeHttpClient([
      { kind: "ok", body: png, contentType: "image/png" },
    ]);
    const out = await fetchImageByUrl("https://public.example/a.png", {
      resolver: FAKE_PUBLIC,
      httpClient: factory,
      timeoutMs: 500,
    });
    expect(out.byteSize).toBe(png.length);
    expect(out.mimeType).toBe("image/png");
    expect(seenHosts).toEqual(["public.example"]);
  });

  it("rejects non-https URLs", async () => {
    await expect(
      fetchImageByUrl("http://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: fakeHttpClient([]).factory,
      }),
    ).rejects.toMatchObject({ reason: "protocol_not_https" });
  });

  it("rejects hosts that resolve to private IPs", async () => {
    const { factory } = fakeHttpClient([]);
    await expect(
      fetchImageByUrl("https://evil.example/a.png", {
        resolver: async () => ["169.254.169.254"],
        httpClient: factory,
      }),
    ).rejects.toMatchObject({ reason: "host_private_range" });
  });

  it("rejects a redirect that lands on a private IP", async () => {
    const png = pngBytes();
    const { factory } = fakeHttpClient([
      { kind: "redirect", location: "https://internal.example/a.png" },
      { kind: "ok", body: png, contentType: "image/png" },
    ]);
    const resolver = async (host: string) => {
      if (host === "public.example") return ["93.184.216.34"];
      if (host === "internal.example") return ["10.1.2.3"];
      return [PUBLIC_IP];
    };
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "host_private_range" });
  });

  it("enforces the redirect depth cap", async () => {
    const { factory } = fakeHttpClient([
      { kind: "redirect", location: "https://public.example/b.png" },
      { kind: "redirect", location: "https://public.example/c.png" },
      { kind: "redirect", location: "https://public.example/d.png" },
    ]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "redirect_limit_exceeded" });
  });

  it("rejects non-image Content-Type even if the byte body is a real PNG", async () => {
    const { factory } = fakeHttpClient([
      { kind: "ok", body: pngBytes(), contentType: "text/html" },
    ]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "non_image_content_type" });
  });

  it("rejects a body whose magic bytes disagree with Content-Type (spoof)", async () => {
    const fakeHtmlPretendingToBeImage = Buffer.from(
      "<!doctype html><script>alert(1)</script>",
      "utf8",
    );
    const { factory } = fakeHttpClient([
      { kind: "ok", body: fakeHtmlPretendingToBeImage, contentType: "image/png" },
    ]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "magic_byte_mismatch" });
  });

  it("rejects content-length over the 10MiB cap without downloading", async () => {
    const { factory } = fakeHttpClient([
      {
        kind: "ok",
        body: pngBytes(),
        contentType: "image/png",
        contentLength: 20 * 1024 * 1024,
      },
    ]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "content_too_large" });
  });

  it("rejects upstream non-2xx status", async () => {
    const { factory } = fakeHttpClient([
      { kind: "status", status: 500, contentType: "image/png" },
    ]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "network_error" });
  });

  it("bubbles up network errors", async () => {
    const { factory } = fakeHttpClient([{ kind: "network_error", message: "econn" }]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({ reason: "network_error" });
  });

  it("enforces a request timeout", async () => {
    const { factory } = fakeHttpClient([{ kind: "hang" }]);
    await expect(
      fetchImageByUrl("https://public.example/a.png", {
        resolver: FAKE_PUBLIC,
        httpClient: factory,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ reason: "fetch_timeout" });
  });
});
