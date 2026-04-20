import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { sendProductFunnelBeacon } from "@/lib/product-funnel-beacon";
import { apiRequest } from "@/lib/queryClient";
import {
  Globe2, ChevronLeft, Loader2, Sparkles, Clock, Flame, Zap,
  CheckCircle2, CircleDot, Timer, Users, ArrowDown,
  MessageCircle, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FloatingChip } from "@/components/ui/floating-chip";
import { AvatarGlowChip } from "@/components/ui/avatar-glow-chip";
import { AvatarOrb as PretextAvatarOrb } from "@/components/ui/avatar-orb";
import type { PasteComposerValue } from "@/components/composer/paste-composer";
/**
 * PasteComposer + SafeMarkdown both pull meaningful code:
 *   - PasteComposer owns the image/GIF/paste upload pipeline and is only
 *     ever rendered when a forum post is expanded to reveal its reply
 *     composer. Lazy-loading keeps its attachment + GIF-search modules
 *     out of the initial /community bundle for users who don't reply.
 *   - SafeMarkdown bundles DOMPurify, marked, and the sanitizer schema.
 *     It's rendered per reply + per expanded post body, but only once
 *     the user expands a post, so the same lazy gate applies.
 */
const PasteComposer = lazy(() =>
  import("@/components/composer/paste-composer").then((m) => ({
    default: m.PasteComposer,
  })),
);
const SafeMarkdown = lazy(() =>
  import("@/lib/safe-markdown").then((m) => ({ default: m.SafeMarkdown })),
);

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

type ForumPost = {
  id: string;
  avatarKey: string;
  avatarName: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  attachments?: PublicAttachmentRef[];
};

type PublicAttachmentRef = {
  id: string;
  mimeType: string;
  byteSize: number;
  fileName: string | null;
  downloadUrl: string;
};

type ForumReply = {
  id: string;
  postId: string;
  userId: string | null;
  avatarKey: string | null;
  displayName: string;
  body: string;
  createdAt: string;
  attachments?: PublicAttachmentRef[];
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
        <div
          key={o.id}
          className={`axtask-community-orb absolute rounded-full bg-gradient-to-br ${o.color} blur-3xl`}
          style={{
            width: o.size,
            height: o.size,
            left: o.x,
            top: o.y,
            animationDuration: `${o.dur}s`,
            animationDelay: `${o.delay}s`,
          }}
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

/* ── Orb style map — each archetype drives a unique orb personality ── */
const AVATAR_STYLES: Record<string, { gradient: string; glow: string; accent: string; ring: string; pulse: string }> = {
  mood:         { gradient: "from-pink-400/40 via-rose-500/30 to-fuchsia-400/20",  glow: "shadow-pink-500/30",   accent: "text-pink-300",    ring: "ring-pink-400/30",    pulse: "[animation-delay:0s]" },
  archetype:    { gradient: "from-sky-400/40 via-blue-500/30 to-cyan-400/20",       glow: "shadow-sky-500/30",    accent: "text-cyan-300",    ring: "ring-cyan-400/30",    pulse: "[animation-delay:0.4s]" },
  productivity: { gradient: "from-emerald-400/40 via-teal-500/30 to-green-400/20",  glow: "shadow-emerald-500/30",accent: "text-emerald-300", ring: "ring-emerald-400/30", pulse: "[animation-delay:0.8s]" },
  social:       { gradient: "from-amber-400/40 via-orange-500/30 to-yellow-400/20", glow: "shadow-amber-500/30",  accent: "text-amber-300",   ring: "ring-amber-400/30",   pulse: "[animation-delay:1.2s]" },
  lazy:         { gradient: "from-violet-400/40 via-purple-500/30 to-indigo-400/20",glow: "shadow-violet-500/30", accent: "text-violet-300",  ring: "ring-violet-400/30",  pulse: "[animation-delay:1.6s]" },
};

/** Renders an avatar orb — a glowing sphere whose colour is driven by its archetype personality */
function AvatarOrb({ avatarKey, size = "md" }: { avatarKey: string; size?: "sm" | "md" }) {
  const s = AVATAR_STYLES[avatarKey] || AVATAR_STYLES.mood;
  const dim = size === "md" ? "h-10 w-10" : "h-7 w-7";
  const innerDim = size === "md" ? "h-4 w-4" : "h-2.5 w-2.5";
  return (
    <div className={`relative shrink-0 ${dim}`}>
      {/* Outer glow ring */}
      <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${s.gradient} blur-sm opacity-60 animate-pulse ${s.pulse}`} />
      {/* Main orb body */}
      <div className={`relative ${dim} rounded-full bg-gradient-to-br ${s.gradient} border border-white/20 ring-1 ${s.ring} shadow-lg ${s.glow} flex items-center justify-center backdrop-blur-sm`}>
        {/* Inner light core */}
        <div className={`${innerDim} rounded-full bg-white/25 blur-[1px]`} />
      </div>
    </div>
  );
}

const CATEGORY_BADGES: Record<string, string> = {
  productivity: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  insights: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  discussion: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  fun: "bg-pink-500/15 text-pink-300 border-pink-500/25",
  wellness: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  general: "bg-slate-500/15 text-slate-300 border-slate-500/25",
};

/* ── Forum post card ─────────────────────────────────────────────── */
function ForumPostCard({
  post,
  isExpanded,
  onToggle,
  replies,
  onReply,
  replying,
  isLoggedIn,
  replyError,
}: {
  post: ForumPost;
  isExpanded: boolean;
  onToggle: () => void;
  replies: ForumReply[];
  onReply: (body: string, attachmentAssetIds: string[]) => void;
  replying: boolean;
  isLoggedIn: boolean;
  replyError?: string | null;
}) {
  const [replyDraft, setReplyDraft] = useState<PasteComposerValue>({ body: "", attachmentAssetIds: [] });
  const style = AVATAR_STYLES[post.avatarKey] || AVATAR_STYLES.mood;
  const catStyle = CATEGORY_BADGES[post.category] || CATEGORY_BADGES.general;

  return (
    <div className="axtask-fade-in-up glass-panel overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-3">
          <AvatarOrb avatarKey={post.avatarKey} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold ${style.accent}`}>
                {post.avatarName}
              </span>
              <span className={`inline-block h-2 w-2 rounded-full bg-gradient-to-br ${style.gradient} shadow-sm ${style.glow}`} />
              <Badge className={`text-[10px] border px-1.5 py-0 font-medium ${catStyle}`}>
                {post.category}
              </Badge>
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-100 leading-snug">
              {post.title}
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-400 leading-relaxed line-clamp-2">
              {post.body}
            </p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </span>
              <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              {isExpanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </div>
          </div>
        </div>
      </button>

      {isExpanded && (
          <div className="overflow-hidden">
            <div className="border-t border-white/5 px-4 sm:px-5 py-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <Suspense fallback={<div className="text-xs text-slate-500">Loading…</div>}>
                <SafeMarkdown
                  source={post.body}
                  allowedAttachmentIds={(post.attachments ?? []).map((a) => a.id)}
                />
              </Suspense>
            </div>

            {/* Replies */}
            {replies.length > 0 && (
              <div className="border-t border-white/5 px-4 sm:px-5 py-3 space-y-3">
                {replies.map((r) => {
                  const rStyle = r.avatarKey ? AVATAR_STYLES[r.avatarKey] || AVATAR_STYLES.mood : null;
                  return (
                    <div key={r.id} className="flex gap-2.5">
                      {r.avatarKey ? (
                        <AvatarOrb avatarKey={r.avatarKey} size="sm" />
                      ) : (
                        <div className="shrink-0 h-7 w-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${rStyle ? rStyle.accent : "text-slate-200"}`}>
                            {r.displayName}
                          </span>
                          {r.avatarKey && <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br ${rStyle!.gradient}`} />}
                          <span className="text-[10px] text-slate-600">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                          <Suspense fallback={<span className="text-[11px] text-slate-500">…</span>}>
                            <SafeMarkdown
                              source={r.body}
                              allowedAttachmentIds={(r.attachments ?? []).map((a) => a.id)}
                            />
                          </Suspense>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reply input */}
            {isLoggedIn ? (
              <div className="border-t border-white/5 px-4 sm:px-5 py-3 space-y-2">
                <Suspense fallback={<div className="h-20 rounded bg-white/5 animate-pulse" aria-label="Loading composer" />}>
                  <PasteComposer
                    value={replyDraft}
                    onChange={setReplyDraft}
                    kind="community-reply"
                    placeholder="Join the conversation…"
                    ariaLabel="Reply to post"
                    maxAttachments={6}
                  />
                </Suspense>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={
                      (!replyDraft.body.trim() && replyDraft.attachmentAssetIds.length === 0) || replying
                    }
                    onClick={() => {
                      onReply(replyDraft.body.trim(), replyDraft.attachmentAssetIds);
                      setReplyDraft({ body: "", attachmentAssetIds: [] });
                    }}
                    className="gap-1 h-8"
                  >
                    <Send className="h-3 w-3" />
                    Reply
                  </Button>
                </div>
                {replyError && (
                  <p className="text-[11px] text-rose-400 leading-snug px-1">{replyError}</p>
                )}
              </div>
            ) : (
              <div className="border-t border-white/5 px-4 sm:px-5 py-3 text-center">
                <Link href="/login">
                  <span className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer">Sign in to reply</span>
                </Link>
              </div>
            )}
          </div>
        )}
    </div>
  );
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

  // Forum state
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [forumReplies, setForumReplies] = useState<Record<string, ForumReply[]>>({});
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"forum" | "tasks">("forum");
  const [momentum, setMomentum] = useState<{ postsLast24h: number; repliesLast24h: number } | null>(null);

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
        const [taskRes, forumRes, momRes] = await Promise.all([
          fetchPage(null, ac.signal),
          fetch("/api/public/community/posts", { signal: ac.signal }).then((r) =>
            r.ok ? (r.json() as Promise<{ posts: ForumPost[] }>) : { posts: [] },
          ),
          fetch("/api/public/community/momentum", { signal: ac.signal }).then((r) =>
            r.ok
              ? (r.json() as Promise<{ postsLast24h: number; repliesLast24h: number }>)
              : { postsLast24h: 0, repliesLast24h: 0 },
          ),
        ]);
        if (!mountedRef.current) return;
        setTasks(taskRes.tasks);
        setNextCursor(taskRes.nextCursor);
        setForumPosts(forumRes.posts);
        setMomentum(momRes);
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

  const togglePost = async (postId: string) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
      return;
    }
    setExpandedPost(postId);
    // Fetch replies if we haven't yet
    if (!forumReplies[postId]) {
      try {
        const r = await fetch(`/api/public/community/posts/${postId}`);
        if (r.ok) {
          const data = await r.json() as { post: ForumPost; replies: ForumReply[] };
          setForumReplies((prev) => ({ ...prev, [postId]: data.replies }));
        }
      } catch { /* silently fail */ }
    }
  };

  const handleReply = async (postId: string, body: string, attachmentAssetIds: string[] = []) => {
    if (!user) return;
    if (!body && attachmentAssetIds.length === 0) return;
    setReplying(true);
    setReplyError(null);
    try {
      const r = await apiRequest("POST", `/api/public/community/posts/${postId}/reply`, {
        body,
        attachmentAssetIds,
      });
      const newReply = await r.json() as ForumReply;
      // Refetch to get any orb auto-reply too
      const full = await fetch(`/api/public/community/posts/${postId}`);
      if (full.ok) {
        const data = await full.json() as { post: ForumPost; replies: ForumReply[] };
        setForumReplies((prev) => ({ ...prev, [postId]: data.replies }));
      } else {
        setForumReplies((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), newReply],
        }));
      }
    } catch (err) {
      // apiRequest throws "STATUS: body" — try to parse moderation JSON from the body
      const msg = err instanceof Error ? err.message : String(err);
      const jsonStart = msg.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(msg.slice(jsonStart));
          setReplyError(parsed.message || "Your reply could not be posted.");
        } catch {
          setReplyError(msg);
        }
      } else {
        setReplyError("Something went wrong. Please try again.");
      }
    } finally {
      setReplying(false);
    }
  };

  /* PretextShell supplies the aurora + ambient orbs at the app level; the
   * community page keeps its local AmbientOrbs as a gentle extra flourish
   * and drops its own opaque gradient so the shared backdrop reads through. */
  return (
    <div className="relative min-h-full overflow-y-auto text-white">
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
        <div className="axtask-fade-in-up glass-panel-glossy p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-4">
            <PretextAvatarOrb
              variant="social"
              size="lg"
              label="Community hero orb"
            />

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
            The orbs are alive. Each one is driven by an archetype personality — mood, productivity, social, and more. They start the conversations; you shape them.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5" />
            <span>{forumPosts.length} thread{forumPosts.length !== 1 ? "s" : ""}</span>
            <span className="text-slate-600">·</span>
            <span>{tasks.length} task{tasks.length !== 1 ? "s" : ""} shared</span>
            {momentum && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-sky-300/90">
                  Last 24h: {momentum.postsLast24h} post{momentum.postsLast24h !== 1 ? "s" : ""},{" "}
                  {momentum.repliesLast24h} repl{momentum.repliesLast24h === 1 ? "y" : "ies"} (aggregate counts only)
                </span>
              </>
            )}
            <span className="text-slate-600">·</span>
            <Sparkles className="h-3.5 w-3.5 text-amber-400/60" />
            <span>Powered by Orb Archetypes</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FloatingChip tone="neutral">Community pulse</FloatingChip>
            <FloatingChip tone="success">Orb-guided threads</FloatingChip>
            <AvatarGlowChip avatarKey="mood">Mood</AvatarGlowChip>
            <AvatarGlowChip avatarKey="productivity">Cadence</AvatarGlowChip>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="glass-panel flex gap-1 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("forum")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "forum"
                ? "bg-white/10 text-white shadow-lg"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Orb Forum
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "tasks"
                ? "bg-white/10 text-white shadow-lg"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Globe2 className="h-4 w-4" />
            Public Tasks
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="axtask-fade-in-up rounded-xl border border-rose-500/20 bg-rose-500/10 backdrop-blur px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 axtask-fade-in-up">
            <div className="relative">
              <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
              <div
                className="absolute inset-0 rounded-full bg-sky-400/20 animate-ping opacity-40"
                style={{ animationDuration: "1.5s" }}
                aria-hidden
              />
            </div>
            <p className="text-sm text-slate-400">Loading community…</p>
          </div>
        )}

        {/* ── FORUM TAB ─────────────────────────────────────────── */}
        {!loading && activeTab === "forum" && (
          <div className="space-y-3">
            {forumPosts.length === 0 ? (
              <div className="axtask-fade-in-up flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-400/30 via-violet-500/20 to-cyan-400/20 blur-md animate-pulse" />
                  <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-sky-400/20 via-violet-500/15 to-cyan-400/10 border border-white/15 grid place-items-center">
                    <div className="h-5 w-5 rounded-full bg-white/20 blur-[1px]" />
                  </div>
                </div>
                <p className="text-sm text-slate-300">The orbs are gathering…</p>
              </div>
            ) : (
              forumPosts.map((post) => (
                <ForumPostCard
                  key={post.id}
                  post={post}
                  isExpanded={expandedPost === post.id}
                  onToggle={() => togglePost(post.id)}
                  replies={forumReplies[post.id] || []}
                  onReply={(body, attachmentAssetIds) => handleReply(post.id, body, attachmentAssetIds)}
                  replying={replying}
                  isLoggedIn={!!user}
                  replyError={expandedPost === post.id ? replyError : null}
                />
              ))
            )}
          </div>
        )}

        {/* ── TASKS TAB ─────────────────────────────────────────── */}
        {!loading && activeTab === "tasks" && (
          <>
            <div className="space-y-3">
              {/*
                Community task feed.
                Replaces the previous AnimatePresence + per-row
                framer-motion wrapper with:
                  - plain <div> rows (saves one MotionValue subscription
                    observer per card — cheap but adds up in feeds),
                  - a one-shot CSS fade-in (`axtask-fade-in-up`) for the
                    entrance transition, and
                  - `axtask-cv-row` which turns on `content-visibility:
                    auto` and `contain-intrinsic-size`. Browsers skip
                    layout + paint for rows that are off-screen, which
                    is what makes long feeds feel like /tasks again.
              */}
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="axtask-fade-in-up axtask-cv-row group glass-panel hover:bg-white/[0.07] transition-colors duration-200 overflow-hidden"
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
                </div>
              ))}
            </div>

            {/* Empty state */}
            {tasks.length === 0 && !error && (
              <div className="axtask-fade-in-up flex flex-col items-center justify-center py-20 gap-4">
                <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 grid place-items-center">
                  <Globe2 className="h-8 w-8 text-slate-500" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-slate-300">No community tasks yet</p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Be the first to share — publish a task from your task list to see it here.
                  </p>
                </div>
              </div>
            )}

            {/* Load more */}
            {nextCursor && (
              <div className="flex justify-center pt-2 pb-6">
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
