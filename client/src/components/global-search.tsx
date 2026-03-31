import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, X, Calendar, Tag, Clock } from "lucide-react";

function highlightMatch(text: string, query: string): JSX.Element {
  if (!query || query.length < 2) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectTask: (task: Task) => void;
}

export function GlobalSearch({ open, onClose, onSelectTask }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/search", { q: debouncedQuery }],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/tasks/search?q=${encodeURIComponent(debouncedQuery)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && debouncedQuery.length >= 2,
  });

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[95vw] max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
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
          />
          <button onClick={onClose} className="shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {debouncedQuery.length < 2 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Type at least 2 characters to search across all your tasks
            </div>
          )}

          {isLoading && debouncedQuery.length >= 2 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              Searching...
            </div>
          )}

          {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              No tasks found matching "{debouncedQuery}"
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1 text-xs text-gray-500 dark:text-gray-400">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
              {results.map((task) => (
                <button
                  key={task.id}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0"
                  onClick={() => { onSelectTask(task); onClose(); }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {highlightMatch(task.activity, debouncedQuery)}
                      </div>
                      {task.notes && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                          {highlightMatch(task.notes, debouncedQuery)}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar className="h-3 w-3" />
                          {task.date}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Tag className="h-3 w-3" />
                          {highlightMatch(task.classification, debouncedQuery)}
                        </span>
                        {task.updatedAt && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            {new Date(task.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={task.status === "completed" ? "secondary" : task.status === "in-progress" ? "default" : "outline"} className="text-xs">
                        {task.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {task.priority}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
          <span>Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">Esc</kbd> to close</span>
          <span>Ctrl+F to toggle</span>
        </div>
      </div>
    </div>
  );
}
