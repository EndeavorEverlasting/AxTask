import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ThumbsUp, ThumbsDown } from "lucide-react";

/**
 * Read panel for peer votes on classification disputes. Lists dispute rows
 * returned from `GET /api/tasks/:taskId/classification/disputes` and lets the
 * viewer toggle agree/disagree on each one they didn't author.
 */
export interface ClassificationDisputeVotesProps {
  taskId: string;
}

interface DisputeRow {
  id: string;
  taskId: string;
  userId: string;
  displayName: string | null;
  originalCategory: string;
  suggestedCategory: string;
  reason: string | null;
  createdAt: string | null;
  agreeCount: number;
  disagreeCount: number;
  totalVotes: number;
  myVote: boolean | null;
}

type DisputesResponse = { disputes: DisputeRow[] };

export function ClassificationDisputeVotes({ taskId }: ClassificationDisputeVotesProps) {
  const queryClientHook = useQueryClient();
  const { toast } = useToast();

  const disputesQuery = useQuery({
    queryKey: ["/api/tasks", taskId, "classification", "disputes"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${taskId}/classification/disputes`);
      return res.json() as Promise<DisputesResponse>;
    },
    staleTime: 15_000,
  });

  const voteMutation = useMutation({
    mutationFn: async (vars: { disputeId: string; agree: boolean }) => {
      const res = await apiRequest(
        "POST",
        `/api/classification/disputes/${vars.disputeId}/vote`,
        { agree: vars.agree },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({
        queryKey: ["/api/tasks", taskId, "classification", "disputes"],
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not record vote";
      toast({ title: "Vote not recorded", description: message, variant: "destructive" });
    },
  });

  const rows = disputesQuery.data?.disputes ?? [];
  if (disputesQuery.isLoading) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="dispute-votes-loading">
        Loading disputes…
      </div>
    );
  }
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="dispute-votes-panel">
      <h4 className="text-sm font-medium">Disputes</h4>
      {rows.map((row) => {
        const ratio = row.totalVotes > 0 ? Math.round((row.agreeCount / row.totalVotes) * 100) : 0;
        const pending = voteMutation.isPending && voteMutation.variables?.disputeId === row.id;
        return (
          <div
            key={row.id}
            className="rounded-md border border-border bg-muted/30 p-3 text-sm"
            data-testid={`dispute-row-${row.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-medium">{row.displayName ?? "Someone"}</span>
                <span className="text-muted-foreground"> suggests </span>
                <span className="font-medium">{row.suggestedCategory}</span>
                <span className="text-muted-foreground"> instead of </span>
                <span className="font-medium">{row.originalCategory}</span>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {row.totalVotes > 0 ? `${ratio}% agree · ${row.totalVotes} votes` : "No votes yet"}
              </div>
            </div>
            {row.reason ? (
              <p className="mt-1 text-muted-foreground text-xs">{row.reason}</p>
            ) : null}
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant={row.myVote === true ? "default" : "outline"}
                disabled={pending}
                onClick={() => voteMutation.mutate({ disputeId: row.id, agree: true })}
                data-testid={`dispute-vote-agree-${row.id}`}
              >
                <ThumbsUp className="mr-1 h-3 w-3" />
                Agree ({row.agreeCount})
              </Button>
              <Button
                size="sm"
                variant={row.myVote === false ? "default" : "outline"}
                disabled={pending}
                onClick={() => voteMutation.mutate({ disputeId: row.id, agree: false })}
                data-testid={`dispute-vote-disagree-${row.id}`}
              >
                <ThumbsDown className="mr-1 h-3 w-3" />
                Disagree ({row.disagreeCount})
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
