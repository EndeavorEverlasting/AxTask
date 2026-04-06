import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/queryClient";

export type LiveClassificationSuggestion = { label: string; confidence: number; source: string };

const SSE_RECONNECT_BASE_MS = 1000;
const SSE_RECONNECT_MAX_MS = 30_000;

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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
      reconnectAttemptRef.current = 0;
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(SSE_RECONNECT_MAX_MS, SSE_RECONNECT_BASE_MS * 2 ** attempt);
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      esRef.current?.close();

      const es = new EventSource("/api/classification/stream", { withCredentials: true });

      es.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

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

      es.onerror = () => {
        if (cancelled) return;
        setLoading(false);
        setSuggestions([]);
        es.close();
        if (esRef.current === es) esRef.current = null;
        scheduleReconnect();
      };

      esRef.current = es;
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled]);

  const pushLiveText = useCallback(
    (activity: string, notes: string) => {
      const snippet = activity.trim();
      if (snippet.length < minChars) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        setSuggestions([]);
        setLoading(false);
        return;
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
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
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { suggestions, loading, pushLiveText };
}
