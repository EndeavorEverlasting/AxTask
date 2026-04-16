import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Coins, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCountUp } from "@/hooks/use-count-up";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WalletTopBar() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: wallet } = useQuery<{ balance: number; currentStreak?: number }>({
    queryKey: ["/api/gamification/wallet"],
  });
  const animated = useCountUp(wallet?.balance ?? 0);

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gamification/offline-generator/claim", {});
      return res.json() as Promise<{ ok: boolean; message?: string; claimedCoins?: number }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      if (data?.ok && (data.claimedCoins ?? 0) > 0) {
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

  return (
    <div className="shrink-0 flex items-center justify-between gap-2 border-b border-amber-200/40 dark:border-amber-900/30 bg-gradient-to-r from-amber-500/12 via-background to-violet-500/10 px-3 py-2 md:px-4">
      <div className="min-w-0 text-xs text-muted-foreground hidden sm:block truncate">
        Tap your balance for shop, history, and quick claim
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50/90 px-3 py-1.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-900/50"
          >
            <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
            <span className="tabular-nums tracking-tight">{animated}</span>
            {(wallet?.currentStreak ?? 0) > 0 && (
              <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400 tabular-nums">
                🔥{wallet?.currentStreak}
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setLocation("/rewards")}>Rewards &amp; profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/rewards?tab=shop")}>Open shop</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/rewards?tab=history")}>Coin history</DropdownMenuItem>
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
