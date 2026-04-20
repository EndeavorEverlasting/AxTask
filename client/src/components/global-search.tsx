import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import type { PublicTaskListItem } from "@shared/public-client-dtos";
import { SafeMarkdown } from "@/lib/safe-markdown";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/queryClient";
import { Search, X, Calendar, Tag, Clock } from "lucide-react";

/**
 * GlobalSearch — full-screen overlay that searches tasks by activity, notes, or
 * classification. Ported from `baseline/published` commit 163b69x with these
 * adaptations for main:
 *
 * - Hits the existing `GET /api/tasks/search/:query` route (not baseline's
 *   query-string variant) so searches participate in `tryCappedCoinAward`
 *   engagement rewards already wired in `server/routes.ts`.
 * - Query-key shape matches `client/src/components/task-list.tsx` so cached
 *   results are shared: `["/api/tasks/search", trimmedQuery]`.
 * - Keyboard: Esc closes; ArrowUp/ArrowDown move selection; Enter opens the
 *   highlighted row. Consumer dispatches `axtask-open-task-edit` (main's
 *   existing handshake) after navigation, so no `pending-edit.ts` helper is
 *   needed.
 * - No `cmdk` / Command dependency — kept decoupled from `ui/command.tsx`.
 */

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTask: (task: Task) => void;
}

function highlightMatch(text: string, query: string): JSX.Element {
  if (!query || query.length < 2) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="bg-amber-300/40 dark:bg-amber-500/30 text-inherit rounded-sm px-0.5 ring-1 ring-amber-400/50 dark:ring-amber-500/40"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function GlobalSearch({ open, onOpenChange, onSelectTask }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = debouncedQuery.trim();
  const canQuery = open && trimmed.length >= 2;

  const { data: results = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/search", trimmed],
    queryFn: async ({ queryKey, signal }) => {
      const q = queryKey[1] as string;
      const res = await apiFetch(
        "GET",
        `/api/tasks/search/${encodeURIComponent(q)}`,
        undefined,
        undefined,
        signal,
      );
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return (await res.json()) as Task[];
    },
    enabled: canQuery,
    staleTime: 15_000,
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [trimmed, results.length]);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const pick = useCallback(
    (task: Task) => {
      onSelectTask(task);
      close();
    },
    [onSelectTask, close],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const task = results[selectedIndex];
        if (task) pick(task);
      }
    },
    [close, results, selectedIndex, pick],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]"
      onClick={close}
      data-testid="global-search-overlay"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[95vw] max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Global task search"
      >
        <div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
          <Search className="h-5 w-5 text-gray-400 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all tasks by activity, notes, or classification..."
            className="border-0 focus-visible:ring-0 text-base h-14"
            data-testid="global-search-input"
          />
          <button
            onClick={close}
            className="shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            aria-label="Close search"
            data-testid="global-search-close"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto" ref={listRef}>
          {trimmed.length < 2 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Type at least 2 characters to search across all your tasks
            </div>
          )}

          {isLoading && canQuery && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Searching...
            </div>
          )}

          {!isLoading && canQuery && results.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              No tasks found matching &ldquo;{trimmed}&rdquo;
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2" data-testid="global-search-results">
              <div className="px-4 py-1 text-xs text-gray-500 dark:text-gray-400">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
              {results.map((task, idx) => {
                const isActive = idx === selectedIndex;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`w-full px-4 py-3 text-left transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                      isActive
                        ? "bg-amber-50 dark:bg-amber-900/10"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => pick(task)}
                    data-testid={`global-search-result-${task.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {highlightMatch(task.activity ?? "", trimmed)}
                        </div>
                        {task.notes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 [&_p]:m-0 [&_img]:max-h-10 [&_img]:rounded">
                            <SafeMarkdown
                              source={task.notes}
                              allowedAttachmentIds={(task as Partial<PublicTaskListItem>).noteAttachmentIds ?? []}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {task.date && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Calendar className="h-3 w-3" />
                              {task.date}
                            </span>
                          )}
                          {task.classification && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Tag className="h-3 w-3" />
                              {highlightMatch(task.classification, trimmed)}
                            </span>
                          )}
                          {task.updatedAt && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock className="h-3 w-3" />
                              {new Date(task.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {task.status && (
                          <Badge
                            variant={
                              task.status === "completed"
                                ? "secondary"
                                : task.status === "in-progress"
                                  ? "default"
                                  : "outline"
                            }
                            className="text-xs"
                          >
                            {task.status}
                          </Badge>
                        )}
                        {task.priority && (
                          <Badge variant="outline" className="text-xs">
                            {task.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">Esc</kbd>{" "}
            to close &middot;{" "}
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">&uarr;&darr;</kbd>{" "}
            to navigate &middot;{" "}
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">Enter</kbd>{" "}
            to open
          </span>
          <span>Ctrl/Cmd+F to toggle</span>
        </div>
      </div>
    </div>
  );
}
