import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest, getCsrfToken } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ThumbsUp, ThumbsDown, MessageSquare, Pin, Eye, EyeOff, Trash2, ArrowUpDown, Clock, X, Image, Tag } from "lucide-react";
import { AvatarCard } from "@/components/avatar-card";
import { MarkdownEditor } from "@/components/markdown-editor";
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

const TAG_COLORS = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) & 0xffffffff;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

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

function TagChips({ tags, onTagClick }: { tags: string[]; onTagClick?: (tag: string) => void }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.map(tag => (
        <button
          key={tag}
          className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80 ${getTagColor(tag)}`}
          onClick={onTagClick ? (e) => { e.stopPropagation(); onTagClick(tag); } : undefined}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: allTags } = useQuery<{ tag: string; count: number }[]>({
    queryKey: ["/api/forum/tags"],
  });

  const normalizeTag = (raw: string) =>
    raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || tags.includes(tag) || tags.length >= 5) return;
    onChange([...tags, tag]);
    setInput("");
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const filtered = (allTags || [])
    .map(t => t.tag)
    .filter(t => input ? t.includes(input.toLowerCase()) : true)
    .filter(t => !tags.includes(t))
    .slice(0, 6);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex flex-wrap gap-1 p-2 border border-input rounded-md min-h-[40px] bg-background focus-within:ring-1 focus-within:ring-ring">
        {tags.map(t => (
          <span key={t} className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${getTagColor(t)}`}>
            #{t}
            <button type="button" onClick={() => removeTag(t)} className="hover:opacity-70 ml-0.5">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {tags.length < 5 && (
          <input
            className="flex-1 min-w-[100px] text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            value={input}
            onChange={e => { setInput(e.target.value); setShowSuggestions(true); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={tags.length === 0 ? "Add tags (Enter or comma)..." : ""}
            maxLength={30}
          />
        )}
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 border border-border rounded-md bg-popover shadow-md z-50 max-h-40 overflow-y-auto">
          {filtered.map(t => (
            <button
              key={t}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={() => addTag(t)}
            >
              <span className={`inline-flex text-xs px-1.5 py-0.5 rounded-full mr-1 ${getTagColor(t)}`}>#{t}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-1">{tags.length}/5 tags used</p>
    </div>
  );
}

function ImageUploader({ imageUrls, onChange }: { imageUrls: string[]; onChange: (urls: string[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFiles = useCallback(async (files: File[]) => {
    const remaining = 3 - imageUrls.length;
    if (remaining <= 0) return;
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    const newUrls: string[] = [];
    for (const file of toUpload) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: `${file.name} exceeds 5 MB`, variant: "destructive" });
        continue;
      }
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
        toast({ title: "Invalid type", description: `${file.name} is not a supported image`, variant: "destructive" });
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("image", file);
        const headers: Record<string, string> = {};
        const csrf = getCsrfToken();
        if (csrf) headers["x-csrf-token"] = csrf;
        const resp = await fetch("/api/forum/upload", { method: "POST", headers, body: fd, credentials: "include" });
        if (!resp.ok) throw new Error((await resp.json()).message || "Upload failed");
        const { url } = await resp.json();
        newUrls.push(url);
      } catch (err) {
        toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
      }
    }
    setUploading(false);
    if (newUrls.length > 0) onChange([...imageUrls, ...newUrls]);
  }, [imageUrls, onChange, toast]);

  const removeImage = (url: string) => onChange(imageUrls.filter(u => u !== url));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={imageUrls.length >= 3 || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
          {uploading ? "Uploading..." : "Add Image"}
        </Button>
        <span className="text-xs text-muted-foreground">{imageUrls.length}/3 images</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = ""; }}
        />
      </div>
      {imageUrls.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {imageUrls.map((url) => (
            <div key={url} className="relative group">
              <img src={url} alt="attachment" className="h-20 w-20 object-cover rounded-md border border-border" />
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(url)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, authors, isAdmin, onNavigate, onTagClick }: {
  post: ForumPost;
  authors: Record<string, { displayName: string | null; profileImageUrl: string | null }>;
  isAdmin: boolean;
  onNavigate: (id: string) => void;
  onTagClick: (tag: string) => void;
}) {
  const { toast } = useToast();
  const author = authors[post.userId];
  const snippet = post.body.length > 150 ? post.body.slice(0, 150) + "..." : post.body;
  const score = post.upvotes - post.downvotes;
  const tags: string[] = Array.isArray(post.tags) ? post.tags : [];
  const imageUrls: string[] = Array.isArray(post.imageUrls) ? post.imageUrls : [];

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
            {imageUrls.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                <Image className="h-3 w-3" />{imageUrls.length}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">{post.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-1">{snippet}</p>
          {tags.length > 0 && <TagChips tags={tags} onTagClick={onTagClick} />}
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <AvatarCard
              userId={post.userId}
              displayName={author?.displayName}
              profileImageUrl={author?.profileImageUrl}
              size="sm"
            />
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(post.createdAt!)}</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.commentCount}</span>
            {(() => {
              const r = (post.reactions || {}) as Record<string, string[]>;
              const entries = Object.entries(r).filter(([, v]) => v.length > 0);
              if (entries.length === 0) return null;
              return (
                <span className="flex items-center gap-0.5">
                  {entries.map(([key, users]) => {
                    const em = key === "thumbsUp" ? "\u{1F44D}" : key === "heart" ? "\u2764\uFE0F" : key === "party" ? "\u{1F389}" : key === "laugh" ? "\u{1F602}" : "\u{1F525}";
                    return <span key={key} className="text-xs">{em}{users.length > 1 ? users.length : ""}</span>;
                  })}
                </span>
              );
            })()}
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

function NewPostDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/forum/posts", { title, body, category, tags, imageUrls }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forum/tags"] });
      toast({ title: "Post created!", description: "You earned 5 AxCoins for posting." });
      setTitle("");
      setBody("");
      setCategory("General");
      setTags([]);
      setImageUrls([]);
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <Input
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
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

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Content</label>
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder="Write your post... (Markdown supported)"
            />
            <p className="text-xs text-muted-foreground mt-1">{body.length}/10000 characters</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />Tags
            </label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Images</label>
            <ImageUploader imageUrls={imageUrls} onChange={setImageUrls} />
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
  const [activeTag, setActiveTag] = useState("");
  const [sort, setSort] = useState<"newest" | "popular">("newest");
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const tagParam = activeTag ? `&tag=${encodeURIComponent(activeTag)}` : "";
  const queryString = `?category=${category}&sort=${sort}&limit=${LIMIT}&offset=${page * LIMIT}${tagParam}`;

  const { data, isLoading } = useQuery<{ posts: ForumPost[]; total: number; authors: Record<string, { displayName: string | null; profileImageUrl: string | null }> }>({
    queryKey: ["/api/forum/posts", queryString],
    refetchInterval: 30000,
  });

  const { data: popularTags } = useQuery<{ tag: string; count: number }[]>({
    queryKey: ["/api/forum/tags"],
    staleTime: 60000,
  });

  const isAdmin = user?.role === "admin";
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  const handleTagClick = (tag: string) => {
    setActiveTag(prev => prev === tag ? "" : tag);
    setPage(0);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Community</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Share tips, ask questions, and connect with others</p>
        </div>
        <NewPostDialog onCreated={() => setPage(0)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
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

      {popularTags && popularTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <Tag className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          {activeTag && (
            <button
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium"
              onClick={() => { setActiveTag(""); setPage(0); }}
            >
              <X className="h-2.5 w-2.5" />Clear tag
            </button>
          )}
          {popularTags.slice(0, 12).map(({ tag }) => (
            <button
              key={tag}
              className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium transition-all ${
                activeTag === tag
                  ? `${getTagColor(tag)} ring-1 ring-current opacity-100`
                  : `${getTagColor(tag)} opacity-70 hover:opacity-100`
              }`}
              onClick={() => handleTagClick(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !data?.posts?.length ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No posts yet</p>
          <p className="text-sm mt-1">
            {activeTag ? `No posts with tag #${activeTag}` : "Be the first to start a conversation!"}
          </p>
          {activeTag && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setActiveTag(""); setPage(0); }}>
              Clear tag filter
            </Button>
          )}
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
                onTagClick={handleTagClick}
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
