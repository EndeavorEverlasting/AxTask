import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/queryClient";

export type LiveClassificationSuggestion = { label: string; confidence: number; source: string };

/**
 * Opens an SSE connection while `enabled` and sends debounced text via POST
 * `/api/classification/stream/push` so classification updates reuse one long-lived connection.
 */
export function useLiveClassificationStream(options: {
  enabled: boolean;
  debounceMs?: number;
  minChars?: number;
}) {
  const { enabled, debounceMs = 450, minChars = 10 } = options;
  const [suggestions, setSuggestions] = useState<LiveClassificationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const es = new EventSource("/api/classification/stream", { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data) as {
          type?: string;
          suggestions?: LiveClassificationSuggestion[];
          seq?: number | null;
        };
        if (d.type === "suggestions" && Array.isArray(d.suggestions)) {
          if (typeof d.seq === "number" && d.seq < seqRef.current) return;
          setSuggestions(d.suggestions.slice(0, 4));
          setLoading(false);
        }
      } catch {
        /* ignore malformed */
      }
    };
    esRef.current = es;
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled]);

  const pushLiveText = useCallback(
    (activity: string, notes: string) => {
      const snippet = activity.trim();
      if (snippet.length < minChars) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setSuggestions([]);
        setLoading(false);
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setLoading(true);
        const seq = ++seqRef.current;
        const preferStream = esRef.current?.readyState === EventSource.OPEN;
        void (async () => {
          try {
            const res = await apiFetch("POST", "/api/classification/stream/push", {
              activity: snippet,
              notes: notes || "",
              preferStream,
              seq,
            });
            if (res.status === 202) {
              if (!preferStream) setLoading(false);
              return;
            }
            if (!res.ok) {
              setLoading(false);
              return;
            }
            const data = (await res.json()) as { suggestions?: LiveClassificationSuggestion[] };
            if (seq === seqRef.current) {
              setSuggestions((data.suggestions ?? []).slice(0, 4));
              setLoading(false);
            }
          } catch {
            setLoading(false);
          }
        })();
      }, debounceMs);
    },
    [debounceMs, minChars],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { suggestions, loading, pushLiveText };
}
