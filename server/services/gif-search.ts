/**
 * Thin Giphy + Tenor proxy. The client never sees our API keys and never hits
 * the third-party origins directly - instead:
 *
 *   1. `/api/gif/search` returns `{ id, title, previewUrl, originalUrl }`
 *      tuples. The client uses `previewUrl` only for the picker thumbnail
 *      (which still passes through our existing `img-src 'self' data: https:`
 *      CSP - we are not widening CSP).
 *   2. When the user selects a GIF, the client POSTs
 *      `{ provider, id, originalUrl }` to `/api/gif/resolve`. That handler
 *      downloads the bytes through the SSRF-safe `fetchImageByUrl`, stores
 *      them in `attachment_assets`, and returns the asset id so the composer
 *      emits `![](attachment:<id>)` exactly like a binary paste.
 *
 * Security notes:
 *   - API keys live only in env (`GIPHY_API_KEY`, `TENOR_API_KEY`) and are
 *     scrubbed from the response so they cannot leak into any HTTP log or
 *     JSON payload returned to the SPA.
 *   - Upstream responses are never forwarded verbatim; we remap to a fixed
 *     shape to avoid reflecting unsanitised fields.
 *   - Rejects search input that contains control chars or exceeds a length
 *     cap before an outbound request is ever made.
 */
import { URL } from "node:url";

export type GifSearchProvider = "giphy" | "tenor";

export type GifSearchResult = {
  id: string;
  title: string;
  provider: GifSearchProvider;
  /** Small preview - resolved + re-hosted on pick. */
  previewUrl: string;
  /** Upstream original URL used by /api/gif/resolve after picking. */
  originalUrl: string;
};

export type GifSearchOptions = {
  q: string;
  limit?: number;
  fetcher?: typeof fetch;
};

export class GifSearchConfigError extends Error {
  readonly provider: GifSearchProvider;
  constructor(provider: GifSearchProvider, message: string) {
    super(message);
    this.provider = provider;
    this.name = "GifSearchConfigError";
  }
}

const MAX_QUERY_LENGTH = 80;
const MAX_LIMIT = 24;
const DEFAULT_LIMIT = 12;

function sanitizeQuery(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new Error("Query required");
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw new Error(`Query exceeds ${MAX_QUERY_LENGTH} chars`);
  }
  // Reject control / zero-width / BOM characters so we do not leak weirdness
  // to either third party.
  if (/[\u0000-\u001f\u007f\u200b\ufeff]/u.test(trimmed)) {
    throw new Error("Query contains control characters");
  }
  return trimmed;
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function getKey(provider: GifSearchProvider): string {
  const key = provider === "giphy" ? process.env.GIPHY_API_KEY : process.env.TENOR_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new GifSearchConfigError(provider, `${provider.toUpperCase()}_API_KEY is not configured`);
  }
  return key.trim();
}

/** Remove any ?api_key=... query param from an upstream response URL. */
function scrubUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const param of ["api_key", "apikey", "key", "client_key"]) {
      u.searchParams.delete(param);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/* ── Giphy ──────────────────────────────────────────────────────────────── */

type GiphySearchResponse = {
  data?: Array<{
    id?: string;
    title?: string;
    images?: {
      fixed_width_small?: { url?: string };
      fixed_width?: { url?: string };
      original?: { url?: string };
    };
  }>;
};

async function giphySearch(options: Required<Pick<GifSearchOptions, "q" | "limit">> & { fetcher: typeof fetch }): Promise<GifSearchResult[]> {
  const apiKey = getKey("giphy");
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("q", options.q);
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("rating", "pg-13");
  const r = await options.fetcher(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`giphy upstream ${r.status}`);
  const body = (await r.json()) as GiphySearchResponse;
  return (body.data ?? [])
    .map((item): GifSearchResult | null => {
      const id = item.id;
      const original = item.images?.original?.url;
      const preview =
        item.images?.fixed_width_small?.url ||
        item.images?.fixed_width?.url ||
        original;
      if (!id || !original || !preview) return null;
      return {
        id,
        provider: "giphy",
        title: item.title ?? "",
        previewUrl: scrubUrl(preview),
        originalUrl: scrubUrl(original),
      };
    })
    .filter((x): x is GifSearchResult => x !== null);
}

/* ── Tenor ──────────────────────────────────────────────────────────────── */

type TenorSearchResponse = {
  results?: Array<{
    id?: string;
    content_description?: string;
    media_formats?: {
      tinygif?: { url?: string };
      nanogif?: { url?: string };
      gif?: { url?: string };
    };
  }>;
};

async function tenorSearch(options: Required<Pick<GifSearchOptions, "q" | "limit">> & { fetcher: typeof fetch }): Promise<GifSearchResult[]> {
  const apiKey = getKey("tenor");
  const url = new URL("https://tenor.googleapis.com/v2/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", options.q);
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("contentfilter", "medium");
  const r = await options.fetcher(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`tenor upstream ${r.status}`);
  const body = (await r.json()) as TenorSearchResponse;
  return (body.results ?? [])
    .map((item): GifSearchResult | null => {
      const id = item.id;
      const original = item.media_formats?.gif?.url;
      const preview =
        item.media_formats?.tinygif?.url ||
        item.media_formats?.nanogif?.url ||
        original;
      if (!id || !original || !preview) return null;
      return {
        id,
        provider: "tenor",
        title: item.content_description ?? "",
        previewUrl: scrubUrl(preview),
        originalUrl: scrubUrl(original),
      };
    })
    .filter((x): x is GifSearchResult => x !== null);
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export async function searchGifs(
  provider: GifSearchProvider,
  rawOptions: GifSearchOptions,
): Promise<GifSearchResult[]> {
  const q = sanitizeQuery(rawOptions.q);
  const limit = clampLimit(rawOptions.limit);
  const fetcher = rawOptions.fetcher ?? globalThis.fetch;
  const opts = { q, limit, fetcher };
  if (provider === "giphy") return giphySearch(opts);
  return tenorSearch(opts);
}

/** Returns true if at least one provider is configured via env. */
export function hasAnyGifProvider(): boolean {
  return Boolean(
    (process.env.GIPHY_API_KEY && process.env.GIPHY_API_KEY.trim()) ||
      (process.env.TENOR_API_KEY && process.env.TENOR_API_KEY.trim()),
  );
}

export const __internal = {
  sanitizeQuery,
  clampLimit,
  scrubUrl,
  MAX_QUERY_LENGTH,
  MAX_LIMIT,
  DEFAULT_LIMIT,
};
