import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import { ListChecks, Sparkles } from "lucide-react";
import type { Task } from "@shared/schema";
import type { PublicTaskListItem } from "@shared/public-client-dtos";
import { SafeMarkdownHtml } from "@/components/safe-markdown-html";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";
import { useToast } from "@/hooks/use-toast";
import { wrapTextToLines } from "@/lib/pretext-layout";
import {
  buildCelebrationNarration,
  pickCelebrationQuip,
} from "@/lib/pretext-checklist-celebration";
import { syncUpdateTask, TaskSyncAbortedError } from "@/lib/task-sync-api";

const PRETEXT_FONT = "13px ui-sans-serif, system-ui, sans-serif";
const CELEBRATION_MAX_WIDTH = 288;
const MAX_ROWS = 8;
const CELEBRATION_MS = 5200;

export function MobileChecklistWidget() {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const { playIfEligible } = useImmersiveSounds();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [celebration, setCelebration] = useState<{ lines: string[]; key: number } | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const todayPending = useMemo(() => {
    return tasks
      .filter((t) => t.date === today && t.status !== "completed")
      .slice(0, MAX_ROWS);
  }, [tasks, today]);

  const clearCelebrationLater = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      setCelebration(null);
      dismissTimer.current = null;
    }, CELEBRATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const completeMutation = useMutation({
    mutationFn: async ({ task }: { task: Task }) => {
      return syncUpdateTask(task.id, { status: "completed" }, task, queryClient);
    },
    onMutate: ({ task }) => {
      setUpdatingIds((prev) => new Set(prev).add(task.id));
    },
    onSettled: (_d, _e, vars) => {
      const id = vars?.task.id;
      if (!id) return;
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSuccess: (data, { task }) => {
      const d = data as { offlineQueued?: boolean; coinReward?: unknown } | undefined;
      if (d?.offlineQueued) {
        toast({
          title: "Saved offline",
          description: "Completion will sync when you're back online.",
        });
        return;
      }

      const quip = pickCelebrationQuip(task.id);
      const narration = buildCelebrationNarration(task.activity, quip);
      const lines = wrapTextToLines(narration, CELEBRATION_MAX_WIDTH, PRETEXT_FONT);
      setCelebration({ lines, key: Date.now() });
      clearCelebrationLater();

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });

      if (d?.coinReward) {
        const cr = d.coinReward as {
          coinsEarned: number;
          newBalance: number;
          streak: number;
          badgesEarned?: unknown[];
        };
        const badgeText = cr.badgesEarned?.length ? ` New badge${cr.badgesEarned.length > 1 ? "s" : ""}!` : "";
        toast({
          title: `+${cr.coinsEarned} AxCoins earned!`,
          description: `Balance: ${cr.newBalance} · Streak: ${cr.streak} day${cr.streak !== 1 ? "s" : ""}.${badgeText}`,
        });
        playIfEligible(1);
      } else {
        playIfEligible(3);
      }
    },
    onError: (e: unknown) => {
      if (e instanceof TaskSyncAbortedError) return;
      toast({
        title: "Could not complete",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const onCheck = useCallback(
    (task: Task, checked: boolean) => {
      if (!checked) return;
      completeMutation.mutate({ task });
    },
    [completeMutation],
  );

  if (!isMobile) return null;

  return (
    <Card className="border-primary/20 shadow-md overflow-hidden">
      <CardHeader className="pb-2 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
              <ListChecks className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base leading-tight">Today&apos;s checklist</CardTitle>
              <CardDescription className="text-xs">Tap a box — Pretext celebrates the line you clear.</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 h-8 text-xs px-2" asChild>
            <Link href="/checklist">Scan</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <AnimatePresence initial={false} mode="sync">
          {celebration && (
            <motion.div
              key={celebration.key}
              role="status"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="flex items-start gap-2 rounded-lg border border-violet-500/30 bg-gradient-to-r from-primary/10 to-violet-500/15 px-3 py-2.5 text-sm text-foreground/95"
            >
              <Sparkles
                className={`h-4 w-4 shrink-0 mt-0.5 text-violet-500 ${reducedMotion ? "" : "motion-safe:animate-pulse"}`}
                aria-hidden
              />
              <div className="space-y-0.5 min-w-0">
                {celebration.lines.map((line, i) => (
                  <motion.p
                    key={`${celebration.key}-${i}`}
                    initial={reducedMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reducedMotion ? 0 : i * 0.04, duration: 0.22 }}
                    className="leading-snug text-primary/95"
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading tasks…</p>
        ) : todayPending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            Nothing dated today — add a task or open the full{" "}
            <Link href="/checklist" className="text-primary underline-offset-2 hover:underline">
              checklist
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-0">
            <AnimatePresence initial={false}>
              {todayPending.map((task) => (
                <motion.li
                  key={task.id}
                  layout={!reducedMotion}
                  initial={false}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, x: -14, transition: { duration: 0.22, ease: "easeIn" } }
                  }
                  className="overflow-hidden border-b border-border/60 last:border-0"
                >
                  <motion.div
                    className="flex items-start gap-3 py-2.5"
                    initial={false}
                    animate={
                      updatingIds.has(task.id) && !reducedMotion
                        ? { scale: [1, 1.02, 1] }
                        : { scale: 1 }
                    }
                    transition={{ duration: 0.35 }}
                  >
                    <Checkbox
                      id={`mcheck-${task.id}`}
                      disabled={updatingIds.has(task.id)}
                      checked={false}
                      onCheckedChange={(v) => onCheck(task, v === true)}
                      className="mt-0.5"
                      aria-label={`Mark complete: ${task.activity}`}
                    />
                    <label
                      htmlFor={`mcheck-${task.id}`}
                      className="text-sm leading-snug cursor-pointer select-none flex-1 min-w-0"
                    >
                      <span className="font-medium text-foreground">{task.activity}</span>
                      {task.notes ? (
                        <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5 [&_.axtask-md-paragraph]:m-0 [&_.axtask-md-image]:max-h-10">
                          <SafeMarkdownHtml
                            source={task.notes}
                            allowedAttachmentIds={(task as Partial<PublicTaskListItem>).noteAttachmentIds ?? []}
                          />
                        </span>
                      ) : null}
                    </label>
                  </motion.div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
