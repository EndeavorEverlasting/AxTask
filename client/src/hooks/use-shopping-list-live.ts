import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const itemsKey = (listId: string) => ["/api/shopping-lists", listId, "items"] as const;

type SerializedItem = Record<string, unknown>;

/**
 * WebSocket subscription for a shared shopping list. Merges server events into
 * the TanStack Query cache for `["/api/shopping-lists", listId, "items"]`.
 */
export function useShoppingListLive(listId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const applyUpsert = useCallback(
    (item: SerializedItem) => {
      if (!listId) return;
      queryClient.setQueryData<SerializedItem[]>(itemsKey(listId), (prev) => {
        if (!prev) return prev;
        const id = String(item.id ?? "");
        const idx = prev.findIndex((r) => String(r.id) === id);
        const next = [...prev];
        if (idx >= 0) next[idx] = item;
        else next.push(item);
        return next.sort((a, b) => {
          const sa = Number(a.sortOrder ?? 0);
          const sb = Number(b.sortOrder ?? 0);
          if (sa !== sb) return sa - sb;
          return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
        });
      });
    },
    [listId, queryClient],
  );

  const applyRemove = useCallback(
    (itemId: string) => {
      if (!listId) return;
      queryClient.setQueryData<SerializedItem[]>(itemsKey(listId), (prev) => {
        if (!prev) return prev;
        return prev.filter((r) => String(r.id) !== itemId);
      });
    },
    [listId, queryClient],
  );

  const invalidateItems = useCallback(() => {
    if (!listId) return;
    void queryClient.invalidateQueries({ queryKey: itemsKey(listId) });
  }, [listId, queryClient]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!listId || !enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connect = () => {
      if (!mountedRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/shopping`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join_list", listId }));
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = msg.type;
        if (type === "list_item_upsert" && msg.item && typeof msg.item === "object") {
          applyUpsert(msg.item as SerializedItem);
        } else if (type === "list_item_removed" && typeof msg.itemId === "string") {
          applyRemove(msg.itemId);
        } else if (type === "list_reordered") {
          invalidateItems();
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;
        reconnectRef.current = setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [listId, enabled, applyUpsert, applyRemove, invalidateItems]);
}
