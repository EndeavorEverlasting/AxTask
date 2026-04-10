import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { sendProductFunnelBeacon } from "@/lib/product-funnel-beacon";
import {
  Globe2, ChevronLeft, Loader2, Sparkles, Clock, Flame, Zap,
  CheckCircle2, CircleDot, Timer, Users, ArrowDown,
} from "lucide-react";
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
  nextCursor: { publishedAt: string; id: string; createdAt: string } | null;
};

/* ── Floating ambient orbs ─────────────────────────────────────────── */
function AmbientOrbs() {
  const orbs = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        size: 120 + Math.random() * 200,
        x: `${10 + (i * 17) % 80}%`,
        y: `${5 + (i * 23) % 70}%`,
        delay: i * 0.7,
        dur: 6 + Math.random() * 4,
        color:
          i % 3 === 0
            ? "from-sky-500/15 to-indigo-500/10"
            : i % 3 === 1
              ? "from-violet-500/12 to-fuchsia-500/8"
              : "from-cyan-400/10 to-teal-400/8",
      })),
    [],
  );
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {orbs.map((o) => (
        <motion.div
          key={o.id}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{
            opacity: [0, 0.6, 0.3, 0.6, 0],
            scale: [0.7, 1.1, 0.9, 1.05, 0.7],
            y: [0, -18, 8, -12, 0],
          }}
          transition={{
            duration: o.dur,
            delay: o.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={`absolute rounded-full bg-gradient-to-br ${o.color} blur-3xl`}
          style={{ width: o.size, height: o.size, left: o.x, top: o.y }}
        />
      ))}
    </div>
  );
}

/* ── Priority icon helper ──────────────────────────────────────────── */
function PriorityIcon({ priority }: { priority: string }) {
  switch (priority.toLowerCase()) {
    case "high":
    case "critical":
      return <Flame className="h-3.5 w-3.5 text-rose-400" />;
    case "medium":
      return <Zap className="h-3.5 w-3.5 text-amber-400" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-sky-400" />;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "in-progress":
      return <Timer className="h-3.5 w-3.5 text-amber-400" />;
    default:
      return <CircleDot className="h-3.5 w-3.5 text-slate-400" />;
  }
}

function priorityColor(p: string) {
  switch (p.toLowerCase()) {
    case "high":
    case "critical":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    case "medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function CommunityPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [nextCursor, setNextCursor] = useState<{
    publishedAt: string;
    id: string;
    createdAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (
      cursor: { publishedAt: string; id: string; createdAt: string } | null,
      signal?: AbortSignal,
    ) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) {
        params.set("cursorAt", cursor.publishedAt);
        params.set("cursorId", cursor.id);
        params.set("cursorCreatedAt", cursor.createdAt);
      }
      const r = await fetch(
        `/api/public/community/tasks?${params.toString()}`,
        { signal },
      );
      if (!r.ok) {
        throw new Error(
          (await r.json().catch(() => ({})))?.message || r.statusText,
        );
      }
      return r.json() as Promise<ListResponse>;
    },
    [],
  );

  useEffect(() => {
    if (user) sendProductFunnelBeacon("community_feed_viewed");
  }, [user]);

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
        if (mountedRef.current)
          setError(e instanceof Error ? e.message : "Failed to load");
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
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  };

  return (
    <div className="relative min-h-full overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <AmbientOrbs />

      <div className="relative mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 space-y-8">
        {/* Back nav */}
        <Link href="/tasks">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-slate-300 hover:text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
            Tasks
          </Button>
        </Link>

        {/* Hero header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 sm:p-8 shadow-2xl"
        >
          <div className="flex items-center gap-4">
            <div className="relative grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-500/25 to-indigo-500/25 border border-sky-400/30 shadow-lg shadow-sky-500/10">
              <Globe2 className="h-7 w-7 text-sky-300" />
              <motion.span
                aria-hidden
                initial={{ scale: 0.85, opacity: 0.15 }}
                animate={{ scale: [0.85, 1.2, 0.85], opacity: [0.15, 0.5, 0.15] }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="absolute inset-0 rounded-2xl border border-sky-300/30"
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-sky-300/80 font-medium">
                AxTask Community
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-sky-100 to-indigo-200 bg-clip-text text-transparent">
                Community Board
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm sm:text-base text-slate-300/80 leading-relaxed max-w-xl">
            Discover what fellow AxTask users are working on. Public tasks from the community — browse, get inspired, and share your own.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5" />
            <span>{tasks.length} task{tasks.length !== 1 ? "s" : ""} shared</span>
            <span className="text-slate-600">·</span>
            <Sparkles className="h-3.5 w-3.5 text-amber-400/60" />
            <span>Collaboration uses owner invites</span>
          </div>
        </motion.div>

        {/* Error state */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-rose-500/20 bg-rose-500/10 backdrop-blur px-4 py-3 text-sm text-rose-300"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-4"
          >
            <div className="relative">
              <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute inset-0 rounded-full bg-sky-400/20"
              />
            </div>
            <p className="text-sm text-slate-400">Loading community tasks…</p>
          </motion.div>
        )}

        {/* Task feed */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {tasks.map((t, idx) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  duration: 0.35,
                  delay: Math.min(idx * 0.04, 0.4),
                  ease: "easeOut",
                }}
                className="group rounded-xl border border-white/8 bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-lg transition-colors duration-200 overflow-hidden"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm sm:text-base font-semibold text-slate-100 leading-snug group-hover:text-white transition-colors">
                      {t.activity}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <StatusIcon status={t.status} />
                      <span className="text-[11px] text-slate-400 capitalize">
                        {t.status.replace("-", " ")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-white/5 rounded-md px-2 py-0.5 border border-white/5">
                      <Clock className="h-3 w-3" />
                      {t.date}
                      {t.time ? ` · ${t.time}` : ""}
                    </span>
                    <Badge
                      className={`text-[11px] border px-2 py-0.5 font-medium ${priorityColor(t.priority)}`}
                    >
                      <PriorityIcon priority={t.priority} />
                      <span className="ml-1">{t.priority}</span>
                    </Badge>
                    <Badge className="text-[11px] border border-violet-500/25 bg-violet-500/10 text-violet-300 px-2 py-0.5 font-medium">
                      {t.classification}
                    </Badge>
                  </div>
                </div>

                {t.notes && (
                  <div className="border-t border-white/5 px-4 sm:px-5 py-3">
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {t.notes}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty state */}
        {!loading && tasks.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-4"
          >
            <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 grid place-items-center">
              <Globe2 className="h-8 w-8 text-slate-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-slate-300">No community tasks yet</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Be the first to share — publish a task from your task list to see it here.
              </p>
            </div>
          </motion.div>
        )}

        {/* Load more */}
        {nextCursor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center pt-2 pb-6"
          >
            <Button
              onClick={loadMore}
              disabled={loadingMore}
              className="gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white backdrop-blur px-6 h-11 shadow-lg transition-all"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  <ArrowDown className="h-4 w-4" />
                  Load more
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
