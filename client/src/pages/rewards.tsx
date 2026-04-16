import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, ShoppingBag, Award, Trophy, Flame, Clock, Sparkles, User, TrendingUp, ThumbsUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCountUp } from "@/hooks/use-count-up";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";

interface Wallet {
  userId: string;
  balance: number;
  lifetimeEarned: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate: string | null;
}

interface RewardItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: string;
  icon: string | null;
  data: string | null;
}

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  details: string | null;
  createdAt: string;
}

interface BadgeDefinition {
  name: string;
  description: string;
  icon: string;
}

interface UserBadge {
  id: string;
  badgeId: string;
  earnedAt: string;
}

interface AvatarProfile {
  id: string;
  avatarKey: "mood" | "archetype" | "productivity" | "social" | "lazy";
  displayName: string;
  archetypeKey: string;
  level: number;
  xp: number;
  totalXp: number;
  mission: string;
}

const REWARD_TABS = new Set(["profile", "investments", "shop", "badges", "history"]);

export default function RewardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    if (tab && REWARD_TABS.has(tab)) {
      setActiveTab(tab);
    }
  }, [search]);

  const { data: wallet } = useQuery<Wallet>({ queryKey: ["/api/gamification/wallet"] });
  const { data: rewards = [] } = useQuery<RewardItem[]>({ queryKey: ["/api/gamification/rewards"] });
  const { data: myRewards = [] } = useQuery<{ id: string; rewardId: string; redeemedAt: string }[]>({ queryKey: ["/api/gamification/my-rewards"] });
  const { data: transactions = [] } = useQuery<Transaction[]>({ queryKey: ["/api/gamification/transactions"] });
  const { data: badgeData } = useQuery<{ earned: UserBadge[]; definitions: Record<string, BadgeDefinition> }>({
    queryKey: ["/api/gamification/badges"],
  });
  const { data: classificationStats } = useQuery<{
    totalClassifications: number;
    totalConfirmationsReceived: number;
    totalClassificationCoins: number;
  }>({ queryKey: ["/api/gamification/classification-stats"] });
  const { data: avatarData } = useQuery<{ avatars: AvatarProfile[] }>({
    queryKey: ["/api/gamification/avatars"],
  });
  const { data: economyDiagnostics } = useQuery<{
    averagePScore: number;
    pScoreScale: string;
    rewardsToday: Array<{ reason: string; todayCount: number; dailyCap: number }>;
  }>({
    queryKey: ["/api/gamification/economy-diagnostics"],
  });

  const animatedBalance = useCountUp(wallet?.balance ?? 0);

  const redeemMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const res = await apiRequest("POST", "/api/gamification/redeem", { rewardId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/my-rewards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      requestFeedbackNudge("reward_redeem");
      toast({ title: "Reward redeemed!", description: "Check your profile for your new reward." });
    },
    onError: (err: Error) => {
      toast({ title: "Redemption failed", description: err.message, variant: "destructive" });
    },
  });

  const engageAvatarMutation = useMutation({
    mutationFn: async (payload: {
      avatarKey: string;
      sourceType: "task" | "feedback" | "post";
      text: string;
      completed?: boolean;
      sourceRef: string;
    }) => {
      const res = await apiRequest("POST", `/api/gamification/avatars/${payload.avatarKey}/engage`, {
        sourceType: payload.sourceType,
        sourceRef: payload.sourceRef,
        text: payload.text,
        completed: payload.completed ?? false,
      });
      return res.json() as Promise<{ awarded: boolean; xp?: number; coins?: number; message?: string }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/avatars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      if (result.awarded) {
        toast({
          title: "Avatar leveled up progress",
          description: `Mission complete: +${result.xp ?? 0} XP and +${result.coins ?? 0} coins`,
        });
      } else {
        toast({
          title: "No mission credit yet",
          description: result.message || "Try a more archetype-focused task or feedback note.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Avatar mission failed", description: err.message, variant: "destructive" });
    },
  });

  const boostAvatarMutation = useMutation({
    mutationFn: async ({ avatarKey, coins }: { avatarKey: string; coins: number }) => {
      const res = await apiRequest("POST", `/api/gamification/avatars/${avatarKey}/spend`, { coins });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/avatars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      toast({ title: "Avatar boosted", description: "Coins spent for avatar XP boost." });
    },
    onError: (err: Error) => {
      toast({ title: "Boost failed", description: err.message, variant: "destructive" });
    },
  });

  const ownedRewardIds = new Set(myRewards.map(r => r.rewardId));

  const groupedRewards = {
    theme: rewards.filter(r => r.type === "theme"),
    badge: rewards.filter(r => r.type === "badge"),
    title: rewards.filter(r => r.type === "title"),
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 md:h-7 md:w-7 text-amber-500" />
            Rewards Shop
          </h2>
          <p className="text-gray-600 dark:text-gray-400">Spend your AxCoins on themes, badges, and titles</p>
        </div>
        <motion.div
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-white px-5 py-3 rounded-xl shadow-lg"
          whileHover={{ scale: 1.05 }}
        >
          <Coins className="h-6 w-6" />
          <span className="text-2xl font-bold tabular-nums">{animatedBalance}</span>
          <span className="text-sm opacity-80">AxCoins</span>
        </motion.div>
      </div>

      {wallet && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-lg">
                <Coins className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-xl font-bold tabular-nums">{wallet.balance}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                <Trophy className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lifetime Earned</p>
                <p className="text-xl font-bold tabular-nums">{wallet.lifetimeEarned}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg">
                <Flame className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Streak</p>
                <p className="text-xl font-bold tabular-nums">{wallet.currentStreak} day{wallet.currentStreak !== 1 ? "s" : ""}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                <Award className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Best Streak</p>
                <p className="text-xl font-bold tabular-nums">{wallet.longestStreak} day{wallet.longestStreak !== 1 ? "s" : ""}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {economyDiagnostics && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Average priority score uses the {economyDiagnostics.pScoreScale} engine scale (same meaning as the task list &quot;Priority (0–10)&quot; column — not AxCoins).
            Current average across tasks:{" "}
            <span className="font-semibold text-foreground">{economyDiagnostics.averagePScore}</span>.
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="investments">Investments</TabsTrigger>
          <TabsTrigger value="shop">Shop</TabsTrigger>
          <TabsTrigger value="badges">Badges</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Your Rewards Profile
              </CardTitle>
              <CardDescription>Your achievements, active rewards, and stats at a glance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-2xl font-bold text-amber-600">{wallet?.balance ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Current Balance</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <p className="text-2xl font-bold text-green-600">{wallet?.lifetimeEarned ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Earned</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <p className="text-2xl font-bold text-orange-600">{wallet?.currentStreak ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Day Streak</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-2xl font-bold text-purple-600">{badgeData?.earned?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Badges Earned</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  Earned Badges
                </h4>
                {(badgeData?.earned?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No badges earned yet. Complete tasks to unlock achievements!</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {badgeData!.earned.map(b => {
                      const def = badgeData!.definitions[b.badgeId];
                      return (
                        <motion.div
                          key={b.id}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700"
                        >
                          <span className="text-lg">{def?.icon}</span>
                          <span className="text-sm font-medium">{def?.name}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  Active Rewards
                </h4>
                {myRewards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rewards redeemed yet. Visit the Shop to spend your AxCoins!</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {myRewards.map(mr => {
                      const reward = rewards.find(r => r.id === mr.rewardId);
                      return (
                        <div key={mr.id} className="flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                          <span className="text-2xl">{reward?.icon}</span>
                          <div>
                            <p className="text-sm font-medium">{reward?.name}</p>
                            <p className="text-xs text-muted-foreground">Redeemed {new Date(mr.redeemedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  Avatar Entourage Missions
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Post a task or feedback related to each companion. The lazy avatar rewards gratitude, rest, prioritizing
                  what to do first, and calmer notification pacing.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(avatarData?.avatars ?? []).map((av) => (
                    <div key={av.id} className="p-4 rounded-xl border bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-slate-900/10">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{av.displayName}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {av.avatarKey} archetype: {av.archetypeKey}
                          </p>
                        </div>
                        <Badge>Lvl {av.level}</Badge>
                      </div>
                      <p className="text-xs mt-2 text-muted-foreground">{av.mission}</p>
                      <div className="mt-2 h-2 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (() => {
                                const nextThreshold = 100 + (av.level - 1) * 25;
                                return nextThreshold > 0 ? (av.xp / nextThreshold) * 100 : 0;
                              })(),
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] mt-1 text-muted-foreground">
                        XP: {av.xp} (total {av.totalXp})
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={engageAvatarMutation.isPending}
                          onClick={() => {
                            const claimDate = new Date().toISOString().slice(0, 10);
                            const lazyDemo =
                              "Grateful for what shipped today. First tomorrow I'll tackle the spec review before anything else — need a short pause after.";
                            engageAvatarMutation.mutate({
                              avatarKey: av.avatarKey,
                              sourceType: "task",
                              text:
                                av.avatarKey === "lazy"
                                  ? lazyDemo
                                  : `Task related to ${av.archetypeKey}`,
                              completed: true,
                              sourceRef: `${av.avatarKey}_task_${claimDate}`,
                            });
                          }}
                        >
                          Claim Task Mission
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={engageAvatarMutation.isPending}
                          onClick={() => {
                            const claimDate = new Date().toISOString().slice(0, 10);
                            engageAvatarMutation.mutate({
                              avatarKey: av.avatarKey,
                              sourceType: "feedback",
                              text:
                                av.avatarKey === "lazy"
                                  ? "Thanks for the calmer pace this week — sliding notifications down helped me breathe and enjoy what is already working."
                                  : `Feedback about ${av.archetypeKey}`,
                              completed: true,
                              sourceRef: `${av.avatarKey}_feedback_${claimDate}`,
                            });
                          }}
                        >
                          Claim Feedback Mission
                        </Button>
                        <Button
                          size="sm"
                          disabled={boostAvatarMutation.isPending || (wallet?.balance ?? 0) < 25}
                          onClick={() => boostAvatarMutation.mutate({ avatarKey: av.avatarKey, coins: 25 })}
                        >
                          Spend 25 Coins
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investments" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-500" />
                Classification Investments
              </CardTitle>
              <CardDescription>
                Earn coins by classifying tasks. When others confirm your classifications,
                you earn compounding interest — like an investment that grows with each confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Classifications Made</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {classificationStats?.totalClassifications ?? 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
                    <ThumbsUp className="h-4 w-4" />
                    <span className="text-sm font-medium">Confirmations Received</span>
                  </div>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                    {classificationStats?.totalConfirmationsReceived ?? 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                    <Coins className="h-4 w-4" />
                    <span className="text-sm font-medium">Total Classification Coins</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                    {classificationStats?.totalClassificationCoins ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10 border border-amber-200 dark:border-amber-800">
                <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">How Compound Interest Works</h4>
                <div className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                  <p>1. Classify a task to earn base coins (5-15 depending on category)</p>
                  <p>2. Each time someone confirms your classification, you earn compound interest at 8% per confirmation</p>
                  <p>3. The formula: <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded text-xs">base × (1.08)^n</code> where n = number of confirmations</p>
                  <p>4. Confirmers also earn 3 coins for each confirmation they give</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shop" className="space-y-6 mt-4">
          {(["theme", "badge", "title"] as const).map(type => (
            <div key={type}>
              <h3 className="text-lg font-semibold capitalize mb-3">{type}s</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedRewards[type].map(reward => {
                  const owned = ownedRewardIds.has(reward.id);
                  return (
                    <motion.div key={reward.id} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
                      <Card className={owned ? "border-green-400 dark:border-green-600" : ""}>
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="text-3xl">{reward.icon}</div>
                            {owned && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Owned</Badge>}
                          </div>
                          <h4 className="font-semibold text-base">{reward.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{reward.description}</p>
                          <div className="flex items-center justify-between mt-4">
                            <span className="flex items-center gap-1 text-amber-600 font-bold">
                              <Coins className="h-4 w-4" /> {reward.cost}
                            </span>
                            <Button
                              size="sm"
                              disabled={owned || (wallet?.balance ?? 0) < reward.cost || redeemMutation.isPending}
                              onClick={() => redeemMutation.mutate(reward.id)}
                            >
                              {owned ? "Owned" : redeemMutation.isPending ? "..." : "Redeem"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="badges" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {badgeData && Object.entries(badgeData.definitions).map(([id, def]) => {
              const earned = badgeData.earned.find(b => b.badgeId === id);
              return (
                <motion.div key={id} whileHover={{ scale: 1.02 }} transition={{ duration: 0.15 }}>
                  <Card className={earned ? "border-amber-400 dark:border-amber-600" : "opacity-60"}>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <span className={`text-3xl ${!earned ? "grayscale" : ""}`}>{def.icon}</span>
                        <div>
                          <h4 className="font-semibold">{def.name}</h4>
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                          {earned && (
                            <p className="text-xs text-amber-600 mt-1">
                              Earned {new Date(earned.earnedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Coin History
              </CardTitle>
              <CardDescription>Your recent AxCoin transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No transactions yet. Complete tasks to earn AxCoins!</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div>
                        <p className="text-sm font-medium capitalize">{tx.reason.replace(/_/g, " ")}</p>
                        {tx.details && <p className="text-xs text-muted-foreground">{tx.details}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold tabular-nums ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                          {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                        </span>
                        <Coins className="h-4 w-4 text-amber-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
