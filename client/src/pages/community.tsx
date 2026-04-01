import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ThumbsUp, ThumbsDown, MessageSquare, Pin, Eye, EyeOff, Trash2, ArrowUpDown, Clock, Users } from "lucide-react";
import type { ForumPost } from "@shared/schema";

const CATEGORIES = ["All", "Tips", "Questions", "Feedback", "Facts", "Productivity", "General"];

const CATEGORY_COLORS: Record<string, string> = {
  Tips: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Questions: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Feedback: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Facts: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Productivity: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  General: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function PostCard({ post, authors, isAdmin, onNavigate }: {
  post: ForumPost;
  authors: Record<string, { displayName: string | null; profileImageUrl: string | null }>;
  isAdmin: boolean;
  onNavigate: (id: string) => void;
}) {
  const { toast } = useToast();
  const author = authors[post.userId];
  const snippet = post.body.length > 150 ? post.body.slice(0, 150) + "..." : post.body;
  const score = post.upvotes - post.downvotes;

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) => apiRequest("PATCH", `/api/forum/admin/posts/${post.id}`, { pinned }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] }); },
  });

  const hideMutation = useMutation({
    mutationFn: (hidden: boolean) => apiRequest("PATCH", `/api/forum/admin/posts/${post.id}`, { hidden }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/forum/admin/posts/${post.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] });
      toast({ title: "Post deleted" });
    },
  });

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer ${post.hidden ? "opacity-60" : ""} ${post.pinned ? "ring-2 ring-amber-400 dark:ring-amber-600" : ""}`}
      onClick={() => onNavigate(post.id)}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 text-center min-w-[40px] pt-1">
          <ThumbsUp className="h-4 w-4 text-gray-400" />
          <span className={`text-sm font-bold ${score > 0 ? "text-green-600 dark:text-green-400" : score < 0 ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>{score}</span>
          <ThumbsDown className="h-4 w-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {post.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
            {post.hidden && <EyeOff className="h-3.5 w-3.5 text-red-400 shrink-0" />}
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.General}`}>
              {post.category}
            </Badge>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">{post.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{snippet}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              {author?.profileImageUrl ? (
                <img src={author.profileImageUrl} alt="" className="h-4 w-4 rounded-full" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
              {author?.displayName || "Anonymous"}
            </span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(post.createdAt!)}</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.commentCount}</span>
          </div>
        </div>
      </div>
      {isAdmin && (
        <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => pinMutation.mutate(!post.pinned)}>
            <Pin className="h-3 w-3 mr-1" />{post.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => hideMutation.mutate(!post.hidden)}>
            {post.hidden ? <><Eye className="h-3 w-3 mr-1" />Show</> : <><EyeOff className="h-3 w-3 mr-1" />Hide</>}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={() => { if (confirm("Delete this post?")) deleteMutation.mutate(); }}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm">$1</code>')
    .replace(/\n/g, "<br />");
}

function NewPostDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/forum/posts", { title, body, category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] });
      toast({ title: "Post created!", description: "You earned 5 AxCoins for posting." });
      setTitle("");
      setBody("");
      setCategory("General");
      setOpen(false);
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create post", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Post
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Input
              placeholder="Post title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.filter(c => c !== "All").map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex gap-1 mb-2">
              <Button type="button" variant={!showPreview ? "default" : "outline"} size="sm" className="text-xs h-7"
                onClick={() => setShowPreview(false)}>Write</Button>
              <Button type="button" variant={showPreview ? "default" : "outline"} size="sm" className="text-xs h-7"
                onClick={() => setShowPreview(true)}>Preview</Button>
            </div>
            {showPreview ? (
              <div className="border rounded-md p-3 min-h-[200px] prose prose-sm dark:prose-invert max-w-none text-sm bg-gray-50 dark:bg-gray-900"
                dangerouslySetInnerHTML={{ __html: body.trim() ? renderMarkdown(body) : '<span class="text-gray-400">Nothing to preview</span>' }} />
            ) : (
              <Textarea
                placeholder="Write your post... (Markdown supported)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                maxLength={10000}
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">{body.length}/10000 characters</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!title.trim() || !body.trim() || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CommunityPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<"newest" | "popular">("newest");
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const { data, isLoading } = useQuery<{ posts: ForumPost[]; total: number; authors: Record<string, { displayName: string | null; profileImageUrl: string | null }> }>({
    queryKey: ["/api/forum/posts", `?category=${category}&sort=${sort}&limit=${LIMIT}&offset=${page * LIMIT}`],
    refetchInterval: 30000,
  });

  const isAdmin = user?.role === "admin";
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Community</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Share tips, ask questions, and connect with others</p>
        </div>
        <NewPostDialog onCreated={() => setPage(0)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {CATEGORIES.map(c => (
            <Button
              key={c}
              variant={category === c ? "default" : "outline"}
              size="sm"
              className="text-xs h-8"
              onClick={() => { setCategory(c); setPage(0); }}
            >
              {c}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 shrink-0"
          onClick={() => setSort(s => s === "newest" ? "popular" : "newest")}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort === "newest" ? "Newest" : "Popular"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !data?.posts?.length ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No posts yet</p>
          <p className="text-sm mt-1">Be the first to start a conversation!</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                authors={data.authors}
                isAdmin={isAdmin}
                onNavigate={(id) => setLocation(`/community/${id}`)}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="flex items-center text-sm text-gray-500">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
