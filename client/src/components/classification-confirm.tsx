import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { syncRawTaskRequest } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThumbsUp, TrendingUp, Users, Coins } from "lucide-react";

interface ClassificationConfirmProps {
  taskId: string;
  classification: string;
  compact?: boolean;
}

interface ContributionData {
  contributions: Array<{
    id: string;
    userId: string;
    displayName: string | null;
    classification: string;
    confirmationCount: number;
    totalCoinsEarned: number;
    baseCoinsAwarded: number;
  }>;
  hasConfirmed: boolean;
  isContributor: boolean;
}

export function ClassificationConfirm({ taskId, classification, compact = false }: ClassificationConfirmProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activated, setActivated] = useState(false);

  const { data, isLoading } = useQuery<ContributionData>({
    queryKey: ["/api/tasks", taskId, "classifications"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/classifications`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activated,
    staleTime: 60000,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      return syncRawTaskRequest("POST", `/api/tasks/${taskId}/confirm-classification`, undefined, queryClient);
    },
    onSuccess: (result: unknown) => {
      if (result && typeof result === "object" && "offlineQueued" in result) {
        toast({
          title: "Queued",
          description: "Confirmation will sync when you're online.",
        });
        return;
      }
      const r = result as {
        confirmerCoins?: number;
        contributorBonuses?: Array<{ displayName: string; bonus: number }>;
        newBalance?: number;
      };
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "classifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/classification-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/badges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      if (typeof r.newBalance === "number") {
        queryClient.setQueryData(["/api/gamification/wallet"], (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev;
          return { ...(prev as Record<string, unknown>), balance: r.newBalance };
        });
      }

      const bonusDetails = r.contributorBonuses
        ?.map((b: { displayName: string; bonus: number }) => `${b.displayName || "User"}: +${b.bonus}`)
        .join(", ");

      toast({
        title: `Classification Confirmed! +${r.confirmerCoins ?? 0} coins`,
        description: bonusDetails
          ? `Compound interest paid to classifiers: ${bonusDetails}${typeof r.newBalance === "number" ? ` · Balance: ${r.newBalance}` : ""}`
          : `Your confirmation has been recorded.${typeof r.newBalance === "number" ? ` Balance: ${r.newBalance}.` : ""}`,
      });
      requestFeedbackNudge("classification_confirm");
    },
    onError: () => {
      toast({ title: "Cannot confirm", description: "You may have already confirmed or be the original classifier.", variant: "destructive" });
    },
  });

  const handleActivate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activated) {
      setActivated(true);
      return;
    }
    if (confirmMutation.isPending) return;
    if (data && !data.hasConfirmed && !data.isContributor && data.contributions.length > 0) {
      confirmMutation.mutate();
    }
  };

  if (!activated) {
    if (compact) {
      return (
        <button
          type="button"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
          onClick={handleActivate}
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
      );
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1 text-gray-400 hover:text-amber-600"
        onClick={handleActivate}
      >
        <ThumbsUp className="h-3 w-3" />
        Verify
      </Button>
    );
  }

  if (isLoading || !data) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400">
        <ThumbsUp className="h-3 w-3 animate-pulse" />
      </span>
    );
  }

  const totalConfirmations = data.contributions.reduce((sum, c) => sum + c.confirmationCount, 0);
  const canConfirm = !data.hasConfirmed && !data.isContributor && data.contributions.length > 0;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all min-h-[32px] min-w-[32px] ${
                canConfirm
                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer active:scale-95"
                  : data?.hasConfirmed
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirmMutation.isPending || !canConfirm) return;
                confirmMutation.mutate();
              }}
              disabled={!canConfirm || confirmMutation.isPending}
            >
              <ThumbsUp className="h-4 w-4" />
              {totalConfirmations > 0 && <span className="tabular-nums">{totalConfirmations}</span>}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {data?.hasConfirmed
                ? "You confirmed this classification"
                : canConfirm
                  ? "Confirm this classification is correct"
                  : "Complete the task to confirm"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <Users className="h-3.5 w-3.5" />
        <span>{totalConfirmations}</span>
      </div>
      {canConfirm && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          onClick={(e) => {
            e.stopPropagation();
            if (confirmMutation.isPending) return;
            confirmMutation.mutate();
          }}
          disabled={confirmMutation.isPending}
        >
          <ThumbsUp className="h-3 w-3" />
          Confirm
        </Button>
      )}
      {data.hasConfirmed && (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <ThumbsUp className="h-3 w-3 fill-current" />
          Confirmed
        </span>
      )}
      {data.contributions.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 cursor-help">
                <TrendingUp className="h-3 w-3" />
                <Coins className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              <div className="text-xs space-y-1">
                <p className="font-semibold">Compound Interest Rewards</p>
                <p className="text-gray-400">Each confirmation compounds 8% on the original classifier's investment</p>
                {data.contributions.map(c => (
                  <div key={c.id} className="flex justify-between gap-3">
                    <span>{c.displayName || "Classifier"}</span>
                    <span className="font-medium text-amber-500">{c.totalCoinsEarned} coins</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
