import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, Flag, Pin, Eye, EyeOff, Trash2, Clock, Users, Send } from "lucide-react";
import type { ForumPost, ForumComment, ForumVote } from "@shared/schema";

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

function ReportDialog({ postId, commentId }: { postId?: string; commentId?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/forum/report", { postId, commentId, reason }),
    onSuccess: () => {
      toast({ title: "Report submitted", description: "Thank you for helping keep the community safe." });
      setReason("");
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to report", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-red-500">
          <Flag className="h-3 w-3 mr-1" />Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Report Content</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input
            placeholder="Reason for reporting..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="destructive" disabled={reason.trim().length < 3 || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Submit Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VoteButtons({ postId, commentId, upvotes, downvotes, userVote }: {
  postId?: string;
  commentId?: string;
  upvotes: number;
  downvotes: number;
  userVote?: "up" | "down" | null;
}) {
  const voteMutation = useMutation({
    mutationFn: (voteType: "up" | "down") =>
      apiRequest("POST", "/api/forum/vote", { postId, commentId, voteType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] });
    },
  });

  const score = upvotes - downvotes;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-7 p-0 ${userVote === "up" ? "text-green-600 bg-green-50 dark:bg-green-900/30" : "text-gray-400 hover:text-green-600"}`}
        onClick={(e) => { e.stopPropagation(); voteMutation.mutate("up"); }}
        disabled={voteMutation.isPending}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <span className={`text-sm font-semibold min-w-[20px] text-center ${score > 0 ? "text-green-600 dark:text-green-400" : score < 0 ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>
        {score}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-7 p-0 ${userVote === "down" ? "text-red-600 bg-red-50 dark:bg-red-900/30" : "text-gray-400 hover:text-red-600"}`}
        onClick={(e) => { e.stopPropagation(); voteMutation.mutate("down"); }}
        disabled={voteMutation.isPending}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function CommentItem({ comment, authors, votes, isAdmin, postId }: {
  comment: ForumComment;
  authors: Record<string, { displayName: string | null; profileImageUrl: string | null }>;
  votes: ForumVote[];
  isAdmin: boolean;
  postId: string;
}) {
  const { toast } = useToast();
  const author = authors[comment.userId];
  const userVote = votes.find(v => v.commentId === comment.id);

  const hideMutation = useMutation({
    mutationFn: (hidden: boolean) => apiRequest("PATCH", `/api/forum/admin/comments/${comment.id}`, { hidden }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/forum/posts", postId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/forum/admin/comments/${comment.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts", postId] });
      toast({ title: "Comment deleted" });
    },
  });

  return (
    <div className={`flex gap-3 py-3 ${comment.hidden ? "opacity-50" : ""}`}>
      <div className="shrink-0">
        {author?.profileImageUrl ? (
          <img src={author.profileImageUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
            <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{author?.displayName || "Anonymous"}</span>
          <span className="text-xs text-gray-400"><Clock className="h-3 w-3 inline mr-0.5" />{timeAgo(comment.createdAt!)}</span>
          {comment.hidden && <Badge variant="outline" className="text-[10px] text-red-400 border-red-300">Hidden</Badge>}
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }} />
        <div className="flex items-center gap-2 mt-2">
          <VoteButtons
            commentId={comment.id}
            upvotes={comment.upvotes}
            downvotes={comment.downvotes}
            userVote={userVote?.voteType as "up" | "down" | undefined}
          />
          <ReportDialog commentId={comment.id} />
          {isAdmin && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400" onClick={() => hideMutation.mutate(!comment.hidden)}>
                {comment.hidden ? <><Eye className="h-3 w-3 mr-1" />Show</> : <><EyeOff className="h-3 w-3 mr-1" />Hide</>}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-600" onClick={() => { if (confirm("Delete comment?")) deleteMutation.mutate(); }}>
                <Trash2 className="h-3 w-3 mr-1" />Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [commentBody, setCommentBody] = useState("");
  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery<{
    post: ForumPost;
    comments: ForumComment[];
    votes: ForumVote[];
    authors: Record<string, { displayName: string | null; profileImageUrl: string | null }>;
  }>({
    queryKey: ["/api/forum/posts", params.id],
    refetchInterval: 15000,
  });

  const commentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/forum/posts/${params.id}/comments`, { body: commentBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] });
      setCommentBody("");
      toast({ title: "Comment posted!", description: "You earned 2 AxCoins." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to comment", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.post) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 text-center py-12">
        <p className="text-gray-500">Post not found</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/community")}>Back to Community</Button>
      </div>
    );
  }

  const { post, comments, votes, authors } = data;
  const author = authors[post.userId];
  const postVote = votes.find(v => v.postId === post.id);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => setLocation("/community")}>
        <ArrowLeft className="h-4 w-4" />Back to Community
      </Button>

      <article className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {post.pinned && <Pin className="h-4 w-4 text-amber-500" />}
          <Badge variant="secondary" className={`text-xs ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.General}`}>
            {post.category}
          </Badge>
          {post.hidden && <Badge variant="outline" className="text-xs text-red-400 border-red-300">Hidden</Badge>}
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">{post.title}</h1>

        <div className="flex items-center gap-3 mb-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            {author?.profileImageUrl ? (
              <img src={author.profileImageUrl} alt="" className="h-5 w-5 rounded-full" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            {author?.displayName || "Anonymous"}
          </span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeAgo(post.createdAt!)}</span>
        </div>

        <div
          className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 mb-4"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
        />

        <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <VoteButtons
            postId={post.id}
            upvotes={post.upvotes}
            downvotes={post.downvotes}
            userVote={postVote?.voteType as "up" | "down" | undefined}
          />
          <span className="text-sm text-gray-500 flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{comments.length} comments</span>
          <ReportDialog postId={post.id} />
        </div>
      </article>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />Comments ({comments.length})
        </h2>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <Textarea
            placeholder="Write a comment..."
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            maxLength={5000}
          />
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!commentBody.trim() || commentMutation.isPending}
              onClick={() => commentMutation.mutate()}
            >
              {commentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post Comment
            </Button>
          </div>
        </div>

        {comments.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">No comments yet. Be the first to comment!</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 divide-y divide-gray-100 dark:divide-gray-700">
            {comments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                authors={authors}
                votes={votes}
                isAdmin={isAdmin}
                postId={post.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
