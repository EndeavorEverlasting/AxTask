import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BUILT_IN_CLASSIFICATIONS } from "@shared/classification-catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Dispute the auto-classification of a task. Rendered on demand from the
 * classification badge's "Disagree" action. Posts to
 * `POST /api/tasks/:taskId/classification/disputes` and invalidates the
 * disputes query so DisputeVotesPanel refreshes.
 *
 * Plain textarea (not PasteComposer) — disputes are moderation metadata, not
 * rich user content. See docs/PASTE_COMPOSER_SECURITY.md for the boundary.
 */
export interface ClassificationDisputeDialogProps {
  taskId: string;
  originalCategory: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REASON_MAX = 500;

export function ClassificationDisputeDialog({
  taskId,
  originalCategory,
  open,
  onOpenChange,
}: ClassificationDisputeDialogProps) {
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const [suggested, setSuggested] = useState("");
  const [reason, setReason] = useState("");

  const categoryOptions = useMemo(() => {
    return BUILT_IN_CLASSIFICATIONS
      .map((c) => c.label)
      .filter((label) => label !== originalCategory);
  }, [originalCategory]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/tasks/${taskId}/classification/disputes`,
        {
          originalCategory,
          suggestedCategory: suggested,
          reason: reason.trim() ? reason.trim() : null,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({
        queryKey: ["/api/tasks", taskId, "classification", "disputes"],
      });
      toast({
        title: "Dispute submitted",
        description: "Peers can now weigh in on this classification.",
      });
      setSuggested("");
      setReason("");
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not submit dispute";
      toast({ title: "Dispute not recorded", description: message, variant: "destructive" });
    },
  });

  const canSubmit = suggested.length > 0 && suggested !== originalCategory && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="classification-dispute-dialog">
        <DialogHeader>
          <DialogTitle>Dispute classification</DialogTitle>
          <DialogDescription>
            Current: <span className="font-medium">{originalCategory}</span>. Suggest a better
            category and optionally explain why. Peers can agree or disagree.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Suggested category
            <select
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={suggested}
              onChange={(e) => setSuggested(e.target.value)}
              data-testid="dispute-suggested-category"
            >
              <option value="">Select a category…</option>
              {categoryOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Reason (optional, up to {REASON_MAX} chars)
            <textarea
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you think this should be reclassified?"
              data-testid="dispute-reason"
            />
            <div className="mt-1 text-xs text-muted-foreground text-right">
              {reason.length} / {REASON_MAX}
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            data-testid="dispute-submit"
          >
            {mutation.isPending ? "Submitting…" : "Submit dispute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
