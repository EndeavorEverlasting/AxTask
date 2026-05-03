import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AdherenceIntervention = {
  id: string;
  signal: "missed_due_dates" | "reminder_ignored" | "streak_drop" | "no_engagement";
  title: string;
  message: string;
  createdAt: string;
};

const QUERY_KEY = ["/api/adherence/interventions?limit=3"];

export function AdherenceNudges() {
  const { toast } = useToast();
  const { data } = useQuery<AdherenceIntervention[]>({
    queryKey: QUERY_KEY,
    refetchInterval: 60_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (input: { id: string; action: "acknowledge" | "dismiss" }) => {
      await apiRequest("POST", `/api/adherence/interventions/${input.id}/acknowledge`, { action: input.action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) return null;

  const top = items[0]!;
  return (
    <div className="px-4 md:px-6 pt-3">
      <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adherence Nudge: {top.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{top.message}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => acknowledgeMutation.mutate({ id: top.id, action: "acknowledge" })}
            >
              Got it
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                acknowledgeMutation.mutate({ id: top.id, action: "dismiss" });
                toast({ title: "Nudge dismissed" });
              }}
            >
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

