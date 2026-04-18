import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Coins, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { useCountUp } from "@/hooks/use-count-up";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FloatingChip } from "@/components/ui/floating-chip";

export function WalletTopBar() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: wallet } = useQuery<{ balance: number; currentStreak?: number }>({
    queryKey: ["/api/gamification/wallet"],
  });
  const { data: rewards = [] } = useQuery<Array<{ id: string; cost: number; name: string }>>({
    queryKey: ["/api/gamification/rewards"],
  });
  const { data: myRewards = [] } = useQuery<Array<{ rewardId: string }>>({
    queryKey: ["/api/gamification/my-rewards"],
  });
  const animated = useCountUp(wallet?.balance ?? 0);
  const ownedRewardIds = new Set(myRewards.map((entry) => entry.rewardId));
  const nextAffordableReward =
    rewards
      .filter((reward) => !ownedRewardIds.has(reward.id) && (wallet?.balance ?? 0) >= reward.cost)
      .sort((a, b) => a.cost - b.cost)[0] ?? null;

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gamification/offline-generator/claim", {});
      return res.json() as Promise<{ ok: boolean; message?: string; claimedCoins?: number }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      if (data?.ok && (data.claimedCoins ?? 0) > 0) {
        requestFeedbackNudge("coin_claim_success");
        toast({
          title: `+${data.claimedCoins} AxCoins`,
          description: data.message || "Offline generator claimed.",
        });
      } else if (data?.ok) {
        toast({ title: "Offline generator", description: data.message || "Nothing to claim yet." });
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not claim offline coins.";
      toast({ title: "Claim failed", description: msg, variant: "destructive" });
    },
  });

  const quickRedeemMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const res = await apiRequest("POST", "/api/gamification/redeem", { rewardId });
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/my-rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      requestFeedbackNudge("reward_redeem");
      toast({ title: "Quick redeem complete", description: data.message || "Reward redeemed." });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not redeem from quick menu.";
      toast({ title: "Quick redeem failed", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="sticky top-0 z-50 shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/50 dark:border-amber-800/50 bg-gradient-to-r from-amber-400/20 via-amber-100/40 to-violet-200/25 dark:from-amber-600/15 dark:via-amber-950/40 dark:to-violet-950/30 px-3 py-3 md:px-5 md:py-3.5 shadow-sm shadow-amber-900/5 backdrop-blur-md">
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800/90 dark:text-amber-300/95">
          AxCoins
        </span>
        <span className="text-xs text-muted-foreground leading-snug max-w-[min(100%,28rem)]">
          Balance stays pinned here — tap to open shop, quick redeem, history, or earn more without leaving your flow.
        </span>
        <div className="mt-1">
          <FloatingChip tone="neutral">Floating wallet rail</FloatingChip>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-2.5 rounded-full border-2 border-amber-400/70 bg-gradient-to-br from-amber-50 to-amber-100/90 px-4 py-2 text-amber-950 shadow-md shadow-amber-600/10 transition hover:brightness-105 dark:border-amber-500/50 dark:from-amber-950/80 dark:to-amber-900/50 dark:text-amber-50 dark:shadow-amber-900/30"
            aria-label="Open AxCoins menu"
          >
            <Coins className="h-6 w-6 text-amber-600 dark:text-amber-300 shrink-0 drop-shadow-sm" aria-hidden />
            <span className="text-xl md:text-2xl font-bold tabular-nums tracking-tight leading-none">{animated}</span>
            {(wallet?.currentStreak ?? 0) > 0 && (
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                🔥{wallet?.currentStreak}
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-70 shrink-0" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setLocation("/rewards")}>Rewards &amp; profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/rewards?tab=shop")}>Open shop</DropdownMenuItem>
          <DropdownMenuItem
            disabled={!nextAffordableReward || quickRedeemMutation.isPending}
            onClick={() => nextAffordableReward && quickRedeemMutation.mutate(nextAffordableReward.id)}
          >
            {nextAffordableReward
              ? `Quick redeem: ${nextAffordableReward.name} (${nextAffordableReward.cost})`
              : "Quick redeem unavailable"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/rewards?tab=history")}>Coin history</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/mini-games")}>Earn from mini-games</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/feedback")}>Give feedback for coins</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={claimMutation.isPending}
            onClick={() => claimMutation.mutate()}
          >
            Claim offline coins
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
