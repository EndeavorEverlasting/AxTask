/**
 * SSRF-hardened remote-URL fetcher used by the paste composer and the GIF
 * picker proxy. Every byte that enters the attachment pipeline by URL flows
 * through this module, then is re-hosted via `writeAttachmentObject` so the
 * SPA never hotlinks a third-party origin at render time.
 *
 * Security posture (mirrors docs/PASTE_COMPOSER_SECURITY.md):
 *   - https: only (no http, file, data, gopher, ftp, blob, javascript, etc.)
 *   - Every resolved A/AAAA address MUST be in a public unicast range.
 *     Loopback, link-local, multicast, broadcast, private RFC1918, CGNAT,
 *     ULA (fc00::/7), and IPv6 loopback/link-local are all rejected.
 *   - Up to 2 HTTP redirects; the destination IP is revalidated on every hop.
 *   - Cookie / Authorization headers are never forwarded.
 *   - Response must advertise `Content-Type: image/*`.
 *   - Body is capped at IMAGE_BYTE_CAP (10 MiB, matches scanAttachmentBuffer).
 *   - Body is sniffed via `scanAttachmentBuffer` after download; a spoofed
 *     Content-Type is treated as a scan failure and audit-logged.
 *   - Per-request timeout of DEFAULT_TIMEOUT_MS (3 s).
 */
import { URL } from "node:url";
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import http from "node:http";
import { Buffer } from "node:buffer";
import { scanAttachmentBuffer } from "./attachment-scan";

export const IMAGE_BYTE_CAP = 10 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 3_000;
export const MAX_REDIRECTS = 2;
export const ALLOWED_IMAGE_MIME_PREFIX = "image/";

export type FetchedImage = {
  buffer: Buffer;
  mimeType: string;
  byteSize: number;
  /** The URL that actually served the bytes (after redirects). */
  finalUrl: string;
};

export type UrlFetchRejection =
  | "protocol_not_https"
  | "invalid_url"
  | "host_not_resolvable"
  | "host_private_range"
  | "redirect_limit_exceeded"
  | "redirect_cross_host_private"
  | "non_image_content_type"
  | "content_too_large"
  | "fetch_timeout"
  | "network_error"
  | "magic_byte_mismatch"
  | "empty_response";

export class UrlFetchError extends Error {
  readonly reason: UrlFetchRejection;
  readonly detail?: string;
  readonly hop?: string;
  constructor(reason: UrlFetchRejection, detail?: string, hop?: string) {
    super(`[attachment-url-fetch] ${reason}${detail ? `: ${detail}` : ""}`);
    this.name = "UrlFetchError";
    this.reason = reason;
    this.detail = detail;
    this.hop = hop;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * IP range checks. Everything that is NOT public unicast is rejected,
 * regardless of how many A/AAAA records resolve.
 * ───────────────────────────────────────────────────────────────────────── */

function ipv4InCidr(ip: string, cidr: [string, number]): boolean {
  const [base, bits] = cidr;
  const ipParts = ip.split(".").map((n) => Number(n));
  const baseParts = base.split(".").map((n) => Number(n));
  if (ipParts.length !== 4 || baseParts.length !== 4) return false;
  const ipInt =
    ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
  const baseInt =
    ((baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

const PRIVATE_V4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // RFC 1918
  ["100.64.0.0", 10],    // CGNAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local
  ["172.16.0.0", 12],    // RFC 1918
  ["192.0.0.0", 24],     // IETF protocol
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.88.99.0", 24],   // 6to4 relay
  ["192.168.0.0", 16],   // RFC 1918
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved + broadcast
  ["255.255.255.255", 32],
];

function isPrivateV4(ip: string): boolean {
  return PRIVATE_V4_CIDRS.some((cidr) => ipv4InCidr(ip, cidr));
}

/** Normalize an IPv6 address to a sequence of 8 16-bit groups (hex, zero-pad). */
function expandV6(ip: string): string[] | null {
  if (!net.isIPv6(ip)) return null;
  const lower = ip.toLowerCase();
  if (lower.includes("%")) {
    return null; // scope-id: never public.
  }
  // IPv4-mapped form "::ffff:1.2.3.4" is handled below.
  const parts = lower.split("::");
  if (parts.length > 2) return null;
  const left = parts[0].length > 0 ? parts[0].split(":") : [];
  const right = parts.length === 2 && parts[1].length > 0 ? parts[1].split(":") : [];

  // Embedded IPv4 suffix - keep it verbatim for the mapped check, but also
  // inline-convert into two 16-bit groups for generic comparisons below.
  const maybeV4 = right.length > 0 ? right[right.length - 1] : left.length > 0 ? left[left.length - 1] : "";
  let tailV4: string[] | null = null;
  if (maybeV4.includes(".")) {
    const octets = maybeV4.split(".").map((n) => Number(n));
    if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const hi = ((octets[0] << 8) | octets[1]).toString(16);
      const lo = ((octets[2] << 8) | octets[3]).toString(16);
      tailV4 = [hi, lo];
      if (right.length > 0) right.pop();
      else left.pop();
    }
  }
  const total = 8;
  const known = left.length + right.length + (tailV4 ? tailV4.length : 0);
  if (known > total) return null;
  const zeros = new Array(total - known).fill("0");
  const groups = [...left, ...zeros, ...right, ...(tailV4 ?? [])];
  if (groups.length !== 8) return null;
  return groups.map((g) => g.padStart(4, "0"));
}

function isPrivateV6(ip: string): boolean {
  const groups = expandV6(ip);
  if (!groups) return true; // unparseable = reject.
  // ::
  if (groups.every((g) => g === "0000")) return true;
  // ::1 loopback
  if (groups.slice(0, 7).every((g) => g === "0000") && groups[7] === "0001") return true;
  // fc00::/7 unique-local
  const firstByte = parseInt(groups[0].slice(0, 2), 16);
  if ((firstByte & 0xfe) === 0xfc) return true;
  // fe80::/10 link-local
  const firstTen = (parseInt(groups[0], 16) & 0xffc0) >>> 0;
  if (firstTen === 0xfe80) return true;
  // ff00::/8 multicast
  if (groups[0].startsWith("ff")) return true;
  // ::ffff:0:0/96 IPv4-mapped
  if (
    groups.slice(0, 5).every((g) => g === "0000") &&
    groups[5].toLowerCase() === "ffff"
  ) {
    const hi = parseInt(groups[6], 16);
    const lo = parseInt(groups[7], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateV4(v4);
  }
  // 64:ff9b::/96 (NAT64) - treat as public? Reject to be safe, since the
  // other side is an arbitrary IPv4; we don't want SSRF to hide behind it.
  if (groups[0] === "0064" && groups[1].toLowerCase() === "ff9b") return true;
  // 2001:db8::/32 documentation prefix
  if (groups[0] === "2001" && groups[1].toLowerCase() === "0db8") return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true; // unknown family = reject.
}

/* ─────────────────────────────────────────────────────────────────────────
 * URL shape + DNS validation
 * ───────────────────────────────────────────────────────────────────────── */

export function parsePublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlFetchError("invalid_url");
  }
  if (url.protocol !== "https:") {
    throw new UrlFetchError("protocol_not_https", url.protocol);
  }
  if (!url.hostname) {
    throw new UrlFetchError("invalid_url", "empty host");
  }
  // Reject userinfo shenanigans (https://evil@target/).
  if (url.username || url.password) {
    throw new UrlFetchError("invalid_url", "userinfo not permitted");
  }
  // Literal IPs: validate immediately. WHATWG URL represents bracketed
  // IPv6 hostnames either with or without brackets depending on Node
  // version; handle both.
  const hostnameStripped = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostnameStripped)) {
    if (isPrivateAddress(hostnameStripped)) {
      throw new UrlFetchError("host_private_range", hostnameStripped);
    }
  }
  return url;
}

type ResolverFn = (hostname: string) => Promise<string[]>;

async function defaultResolver(hostname: string): Promise<string[]> {
  const entries = await dns.lookup(hostname, { all: true, verbatim: true });
  return entries.map((e) => e.address);
}

export async function assertHostIsPublic(
  hostname: string,
  resolver: ResolverFn = defaultResolver,
): Promise<string[]> {
  const stripped = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(stripped)) {
    if (isPrivateAddress(stripped)) {
      throw new UrlFetchError("host_private_range", stripped);
    }
    return [stripped];
  }
  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch (err) {
    throw new UrlFetchError("host_not_resolvable", hostname);
  }
  if (!addresses || addresses.length === 0) {
    throw new UrlFetchError("host_not_resolvable", hostname);
  }
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new UrlFetchError("host_private_range", `${hostname} -> ${addr}`);
    }
  }
  return addresses;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Actual fetch. Uses https.get directly so we can control redirects and
 * cap the body stream without relying on a 3rd-party HTTP library.
 * ───────────────────────────────────────────────────────────────────────── */

export type FetchOptions = {
  /** DNS resolver - injected by tests. */
  resolver?: ResolverFn;
  /** HTTP client injected by tests. Real caller uses node:https. */
  httpClient?: (url: URL, onResponse: (res: http.IncomingMessage) => void) => http.ClientRequest;
  timeoutMs?: number;
};

function defaultHttpClient(
  url: URL,
  onResponse: (res: http.IncomingMessage) => void,
): http.ClientRequest {
  return https.get(
    {
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      // We explicitly DO NOT forward Cookie / Authorization; set only our UA
      // so upstreams can allow-list us if they need to.
      headers: {
        "user-agent": "AxTask/1 (+paste-composer)",
        accept: "image/*",
      },
    },
    onResponse,
  );
}

async function fetchSingleHop(
  url: URL,
  opts: Required<Pick<FetchOptions, "resolver" | "httpClient" | "timeoutMs">>,
): Promise<{ response: http.IncomingMessage; finalUrl: URL; redirectTo?: URL }> {
  await assertHostIsPublic(url.hostname, opts.resolver);
  return new Promise((resolve, reject) => {
    const req = opts.httpClient(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        let next: URL;
        try {
          next = new URL(res.headers.location, url);
        } catch {
          res.resume();
          reject(new UrlFetchError("invalid_url", `redirect to ${res.headers.location}`));
          return;
        }
        res.resume();
        resolve({ response: res, finalUrl: url, redirectTo: next });
        return;
      }
      resolve({ response: res, finalUrl: url });
    });
    req.on("error", (err) => {
      if (err instanceof UrlFetchError) {
        reject(err);
        return;
      }
      reject(new UrlFetchError("network_error", err.message, url.hostname));
    });
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new UrlFetchError("fetch_timeout", `${opts.timeoutMs}ms`, url.hostname));
    });
  });
}

function readCappedBody(
  res: http.IncomingMessage,
  cap: number,
  hop: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    res.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > cap) {
        settle(() => {
          res.destroy();
          reject(new UrlFetchError("content_too_large", `${total}b > ${cap}b`, hop));
        });
        return;
      }
      chunks.push(chunk);
    });
    res.on("end", () => {
      settle(() => {
        resolve(Buffer.concat(chunks, total));
      });
    });
    res.on("error", (err) => {
      settle(() => reject(new UrlFetchError("network_error", err.message, hop)));
    });
    res.on("aborted", () => {
      settle(() => reject(new UrlFetchError("network_error", "aborted", hop)));
    });
  });
}

export async function fetchImageByUrl(
  rawUrl: string,
  options: FetchOptions = {},
): Promise<FetchedImage> {
  const resolver = options.resolver ?? defaultResolver;
  const httpClient = options.httpClient ?? defaultHttpClient;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let current = parsePublicHttpsUrl(rawUrl);
  let hops = 0;

  while (true) {
    const { response, redirectTo } = await fetchSingleHop(current, {
      resolver,
      httpClient,
      timeoutMs,
    });
    if (redirectTo) {
      hops += 1;
      if (hops > MAX_REDIRECTS) {
        throw new UrlFetchError(
          "redirect_limit_exceeded",
          `${hops} > ${MAX_REDIRECTS}`,
          current.hostname,
        );
      }
      // Revalidate destination: protocol + host + IP range.
      const next = parsePublicHttpsUrl(redirectTo.toString());
      current = next;
      continue;
    }

    const status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      response.resume();
      throw new UrlFetchError(
        "network_error",
        `HTTP ${status}`,
        current.hostname,
      );
    }

    const ctRaw = String(response.headers["content-type"] ?? "").toLowerCase();
    const mimeType = ctRaw.split(";")[0].trim();
    if (!mimeType.startsWith(ALLOWED_IMAGE_MIME_PREFIX)) {
      response.resume();
      throw new UrlFetchError(
        "non_image_content_type",
        mimeType || "<none>",
        current.hostname,
      );
    }

    const declaredLength = Number(response.headers["content-length"] ?? "0");
    if (declaredLength && declaredLength > IMAGE_BYTE_CAP) {
      response.resume();
      throw new UrlFetchError(
        "content_too_large",
        `content-length ${declaredLength}`,
        current.hostname,
      );
    }

    const buffer = await readCappedBody(response, IMAGE_BYTE_CAP, current.hostname);
    if (buffer.length === 0) {
      throw new UrlFetchError("empty_response", undefined, current.hostname);
    }
    const scan = scanAttachmentBuffer(buffer, mimeType);
    if (!scan.clean) {
      throw new UrlFetchError("magic_byte_mismatch", scan.reason, current.hostname);
    }

    return {
      buffer,
      mimeType,
      byteSize: buffer.length,
      finalUrl: current.toString(),
    };
  }
}
