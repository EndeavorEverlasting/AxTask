import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, MessageSquare, Flame, Coins, Award, Trophy, Clock, UserPlus, UserMinus, ArrowLeft, Pencil, Check, X } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  Tips: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Questions: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Feedback: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Facts: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Productivity: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  General: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

function timeAgo(date: string | Date | null): string {
  if (!date) return "";
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

type ActivityItem =
  | { type: "post"; id: string; title: string; category: string; createdAt: string | null; commentCount: number; score: number }
  | { type: "comment"; id: string; postId: string; body: string; createdAt: string | null; score: number };

interface ProfilePost {
  id: string;
  title: string;
  category: string;
  createdAt: string | null;
  commentCount: number;
  upvotes: number;
  downvotes: number;
}

interface ProfileData {
  userId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  equippedTitle: string | null;
  skillTier: 0 | 1 | 2;
  badges: { id: string; badgeId: string; earnedAt: string | null }[];
  coinBalance: number;
  lifetimeEarned: number;
  currentStreak: number;
  longestStreak: number;
  streakShields: number;
  postCount: number;
  commentCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  recentActivity: ActivityItem[];
  posts: ProfilePost[];
  postsTotal: number;
}

interface BadgeDefinition {
  name: string;
  description: string;
  icon: string;
}

function SkillTierBadge({ tier }: { tier: 0 | 1 | 2 }) {
  if (tier === 0) return null;
  const styles =
    tier === 2
      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-300 dark:border-blue-700";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${styles}`}>
      Tier {tier}
    </span>
  );
}

const POSTS_PER_PAGE = 10;

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [postsPage, setPostsPage] = useState(0);

  const rawUserId = params.userId;

  useEffect(() => {
    if (rawUserId === "me" && user?.id) {
      setLocation(`/profile/${user.id}`, { replace: true });
    }
  }, [rawUserId, user?.id]);

  const resolvedUserId = rawUserId === "me" ? user?.id : rawUserId;
  const isOwnProfile = resolvedUserId === user?.id;

  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/users", resolvedUserId, "profile", `?postsPage=${postsPage}`],
    enabled: !!resolvedUserId && rawUserId !== "me",
  });

  const { data: badgeDefinitions } = useQuery<{ definitions: Record<string, BadgeDefinition> }>({
    queryKey: ["/api/gamification/badges"],
    enabled: isOwnProfile,
  });

  const followMutation = useMutation({
    mutationFn: (following: boolean) =>
      following
        ? apiRequest("DELETE", `/api/users/${resolvedUserId}/follow`)
        : apiRequest("POST", `/api/users/${resolvedUserId}/follow`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", resolvedUserId, "profile"] });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: (displayName: string) =>
      apiRequest("PATCH", "/api/auth/profile", { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", resolvedUserId, "profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setEditingName(false);
      toast({ title: "Display name updated!" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  if (rawUserId === "me" || !resolvedUserId) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center py-12">
        <p className="text-gray-500">User not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/community")}>
          Back to Community
        </Button>
      </div>
    );
  }

  const name = profile.displayName || "Anonymous";
  const avatarUrl = profile.profileImageUrl;
  const totalPostsPages = Math.ceil(profile.postsTotal / POSTS_PER_PAGE);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <Button variant="ghost" size="sm" className="gap-1 mb-2" onClick={() => history.back()}>
        <ArrowLeft className="h-4 w-4" />Back
      </Button>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover shrink-0" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0">
                <Users className="h-8 w-8 text-gray-400" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-8 text-sm w-48"
                      maxLength={50}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={!newName.trim() || updateNameMutation.isPending}
                      onClick={() => updateNameMutation.mutate(newName.trim())}
                    >
                      {updateNameMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingName(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{name}</h1>
                    {isOwnProfile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => { setNewName(profile.displayName || ""); setEditingName(true); }}
                        title="Edit display name"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
                <SkillTierBadge tier={profile.skillTier} />
              </div>

              {profile.equippedTitle && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">{profile.equippedTitle}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <strong className="text-gray-700 dark:text-gray-300">{profile.followerCount}</strong> followers
                </span>
                <span className="flex items-center gap-1">
                  <strong className="text-gray-700 dark:text-gray-300">{profile.followingCount}</strong> following
                </span>
              </div>
            </div>

            {!isOwnProfile && user && (
              <Button
                variant={profile.isFollowing ? "outline" : "default"}
                size="sm"
                className="gap-1.5 shrink-0"
                disabled={followMutation.isPending}
                onClick={() => followMutation.mutate(profile.isFollowing)}
              >
                {followMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : profile.isFollowing ? (
                  <><UserMinus className="h-3.5 w-3.5" />Unfollow</>
                ) : (
                  <><UserPlus className="h-3.5 w-3.5" />Follow</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-1">
              <Coins className="h-4 w-4 text-amber-500 mr-1" />
              <span className="text-lg font-bold text-amber-600">{profile.coinBalance}</span>
            </div>
            <p className="text-xs text-muted-foreground">AxCoins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-1">
              <Flame className="h-4 w-4 text-orange-500 mr-1" />
              <span className="text-lg font-bold text-orange-600">{profile.longestStreak}</span>
            </div>
            <p className="text-xs text-muted-foreground">Best Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-1">
              <MessageSquare className="h-4 w-4 text-blue-500 mr-1" />
              <span className="text-lg font-bold text-blue-600">{profile.postCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Posts · <span className="text-gray-500">{profile.commentCount} comments</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center mb-1">
              <Award className="h-4 w-4 text-purple-500 mr-1" />
              <span className="text-lg font-bold text-purple-600">{profile.badges.length}</span>
            </div>
            <p className="text-xs text-muted-foreground">Badges</p>
          </CardContent>
        </Card>
      </div>

      {isOwnProfile && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-green-600">{profile.lifetimeEarned}</p>
              <p className="text-xs text-muted-foreground">Lifetime Earned</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-orange-600">{profile.currentStreak}</p>
              <p className="text-xs text-muted-foreground">Current Streak</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-cyan-600">{profile.streakShields}</p>
              <p className="text-xs text-muted-foreground">Streak Shields</p>
            </CardContent>
          </Card>
        </div>
      )}

      {profile.badges.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              Earned Badges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.badges.map(b => {
                const def = badgeDefinitions?.definitions?.[b.badgeId];
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                    title={def?.description}
                  >
                    <span className="text-base">{def?.icon ?? "🏅"}</span>
                    <span className="text-xs font-medium">{def?.name ?? b.badgeId}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Recent Activity
            <span className="text-xs font-normal text-muted-foreground ml-1">(last 10 posts & comments)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {profile.recentActivity.map(item => (
                item.type === "post" ? (
                  <Link key={`post-${item.id}`} href={`/community/${item.id}`} className="block group">
                    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition-colors">
                      <MessageSquare className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Post</span>
                          <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.General}`}>
                            {item.category}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary line-clamp-1">{item.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>{timeAgo(item.createdAt)}</span>
                          <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{item.commentCount}</span>
                          <span className="flex items-center gap-0.5"><Trophy className="h-3 w-3" />{item.score}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <Link key={`comment-${item.id}`} href={`/community/${item.postId}`} className="block group">
                    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition-colors">
                      <MessageSquare className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Comment</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{item.body}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>{timeAgo(item.createdAt)}</span>
                          <span className="flex items-center gap-0.5"><Trophy className="h-3 w-3" />{item.score}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            All Posts
            <span className="text-xs font-normal text-muted-foreground ml-1">({profile.postsTotal} total)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No posts yet.</p>
          ) : (
            <>
              <div className="space-y-2">
                {profile.posts.map(post => (
                  <Link key={post.id} href={`/community/${post.id}`} className="block group">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-sm transition-all">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.General}`}>
                            {post.category}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary line-clamp-1">{post.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(post.createdAt)}</span>
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.commentCount}</span>
                          <span className="flex items-center gap-1">
                            <Trophy className="h-3 w-3" />{post.upvotes - post.downvotes}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {totalPostsPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={postsPage === 0}
                    onClick={() => setPostsPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center text-sm text-gray-500">
                    Page {postsPage + 1} of {totalPostsPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={postsPage >= totalPostsPages - 1}
                    onClick={() => setPostsPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
