import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Globe2, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PublicTask = {
  id: string;
  activity: string;
  date: string;
  time: string | null;
  status: string;
  priority: string;
  classification: string;
  notes?: string;
};

type ListResponse = {
  tasks: PublicTask[];
  nextCursor: { publishedAt: string; id: string } | null;
};

export default function CommunityPage() {
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [nextCursor, setNextCursor] = useState<{ publishedAt: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (cursor: { publishedAt: string; id: string } | null, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) {
        params.set("cursorAt", cursor.publishedAt);
        params.set("cursorId", cursor.id);
      }
      const r = await fetch(`/api/public/community/tasks?${params.toString()}`, { signal });
      if (!r.ok) {
        throw new Error((await r.json().catch(() => ({})))?.message || r.statusText);
      }
      return r.json() as Promise<ListResponse>;
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const j = await fetchPage(null, ac.signal);
        if (!mountedRef.current) return;
        setTasks(j.tasks);
        setNextCursor(j.nextCursor);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (mountedRef.current) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
      ac.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (!nextCursor) return;
    loadMoreAbortRef.current?.abort();
    const ac = new AbortController();
    loadMoreAbortRef.current = ac;
    setLoadingMore(true);
    setError(null);
    try {
      const j = await fetchPage(nextCursor, ac.signal);
      if (!mountedRef.current) return;
      setTasks((t) => [...t, ...j.tasks]);
      setNextCursor(j.nextCursor);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (mountedRef.current) setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tasks">
          <Button variant="ghost" size="sm" className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Tasks
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Globe2 className="h-8 w-8 text-sky-600 dark:text-sky-400" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Community tasks</h1>
          <p className="text-sm text-muted-foreground">
            Public listings from AxTask users. Collaboration still uses owner invites.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-3">
        {tasks.map((t) => (
          <Card key={t.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-base leading-snug">{t.activity}</CardTitle>
              <CardDescription className="flex flex-wrap gap-2 items-center">
                <span>
                  {t.date}
                  {t.time ? ` · ${t.time}` : ""}
                </span>
                <Badge variant="outline">{t.priority}</Badge>
                <Badge variant="secondary">{t.classification}</Badge>
                <Badge variant="outline">{t.status}</Badge>
              </CardDescription>
            </CardHeader>
            {t.notes ? (
              <CardContent className="pt-0 text-sm text-muted-foreground border-t">
                <p className="pt-3 whitespace-pre-wrap">{t.notes}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      {!loading && tasks.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-8">No community tasks yet.</p>
      )}

      {nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="w-full">
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
