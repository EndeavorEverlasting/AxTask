import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Listens for `requestFeedbackNudge` events and offers a one-tap path to /feedback. */
export function FeedbackNudgeDialog() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | undefined>();

  useEffect(() => {
    const onNudge = (ev: Event) => {
      const e = ev as CustomEvent<{ source?: string }>;
      setSource(e.detail?.source);
      setOpen(true);
    };
    window.addEventListener("axtask-feedback-nudge", onNudge);
    return () => window.removeEventListener("axtask-feedback-nudge", onNudge);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onClick={(ev) => ev.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Share a quick thought?</DialogTitle>
          <DialogDescription>
            {source === "task_complete"
              ? "How did completing that task feel — smooth, confusing, or missing something?"
              : source === "recalculate"
                ? "Did priority recalculation match what you expected?"
                : source === "dashboard_visit"
                  ? "Anything about the dashboard or task flow you would change?"
                  : source === "task_create"
                    ? "Was creating this task frictionless, or did something confuse you?"
                    : source === "bulk_actions"
                      ? "Bulk changes in one go — anything feel risky or unclear?"
                      : source === "task_search_success"
                        ? "Did search help you find what you needed quickly?"
                        : source === "classification_confirm"
                          ? "Was classification confirmation clear and worth the reward?"
                          : source === "classification_reclassify"
                            ? "Did reclassification suggestions feel accurate?"
                            : source === "reward_redeem"
                              ? "Did redeeming rewards feel fast and useful?"
                              : source === "coin_claim_success"
                                ? "Was the reminder timing useful for claiming coins?"
                                : source === "classification_thumbs_up"
                                  ? "Did rewarding a quick thumbs-up on classification feel fair?"
                      : "A short note helps us tune AxTask for real workflows."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              setLocation("/feedback");
            }}
          >
            Open feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
