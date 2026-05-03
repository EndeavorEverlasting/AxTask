/**
 * Server-proxied GIF search picker. Calls `/api/gif/search` (never directly
 * hits Giphy/Tenor) and on selection calls `/api/gif/resolve` which re-hosts
 * the bytes through the SSRF-safe fetcher.
 *
 * The picker only renders `previewUrl` thumbs that came back from the server
 * - it does NOT trust the client with an originalUrl. Selection POSTs the
 * tuple `{ provider, id, originalUrl }` verbatim back to the server, which
 * re-validates it.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type GifResult = {
  id: string;
  provider: "giphy" | "tenor";
  title: string;
  previewUrl: string;
  originalUrl: string;
};

export type GifPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (result: Pick<GifResult, "id" | "provider" | "originalUrl">) => Promise<unknown> | unknown;
  provider?: "giphy" | "tenor";
};

export function GifPicker({
  open,
  onClose,
  onPick,
  provider: providerProp = "giphy",
}: GifPickerProps): React.ReactElement | null {
  const [provider, setProvider] = useState<"giphy" | "tenor">(providerProp);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (q: string, p: "giphy" | "tenor") => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setError(null);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/gif/search", window.location.origin);
        url.searchParams.set("q", trimmed);
        url.searchParams.set("provider", p);
        const res = await fetch(url.pathname + url.search, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`${res.status}: ${body || res.statusText}`);
        }
        const json = (await res.json()) as { results?: GifResult[] };
        setResults(Array.isArray(json.results) ? json.results : []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (abortRef.current === ac) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => runSearch(query, provider), 250);
    return () => window.clearTimeout(id);
  }, [query, provider, open, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  return (
    <div
      className="axtask-gif-picker glass-panel-glossy"
      role="dialog"
      aria-label="GIF picker"
      data-testid="gif-picker"
    >
      <div className="axtask-gif-picker__toolbar">
        <input
          className="axtask-gif-picker__input"
          type="search"
          placeholder="Search GIFs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="GIF search"
          maxLength={80}
        />
        <select
          className="axtask-gif-picker__provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as "giphy" | "tenor")}
          aria-label="GIF provider"
        >
          <option value="giphy">Giphy</option>
          <option value="tenor">Tenor</option>
        </select>
        <button
          type="button"
          className="axtask-gif-picker__close"
          onClick={onClose}
          aria-label="Close GIF picker"
        >
          ×
        </button>
      </div>
      {error && (
        <p className="axtask-gif-picker__error" role="status">
          {error}
        </p>
      )}
      {loading && <p className="axtask-gif-picker__loading">Searching…</p>}
      <ul className="axtask-gif-picker__grid">
        {results.map((r) => (
          <li key={`${r.provider}-${r.id}`} className="axtask-gif-picker__tile">
            <button
              type="button"
              onClick={() =>
                onPick({
                  id: r.id,
                  provider: r.provider,
                  originalUrl: r.originalUrl,
                })
              }
              aria-label={`Pick GIF ${r.title || r.id}`}
            >
              <img
                src={r.previewUrl}
                alt={r.title || ""}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Exported so external callers can wire gif results into paste-upload. */
export async function resolvePickedGif(result: {
  provider: "giphy" | "tenor";
  id: string;
  originalUrl: string;
}): Promise<{ assetId: string; mimeType: string; byteSize: number }> {
  const res = await apiRequest("POST", "/api/gif/resolve", result);
  return (await res.json()) as { assetId: string; mimeType: string; byteSize: number };
}
