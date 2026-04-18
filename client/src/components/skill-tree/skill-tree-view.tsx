import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { resolveSkillUnlockSource } from "@/lib/skill-tree-feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Coins, Lock, Check, Zap } from "lucide-react";

export type SkillTreeKind = "avatar" | "offline";

/**
 * Shape returned by `GET /api/gamification/avatar-skills` and `GET /api/gamification/offline-skills`.
 * Mirrors `getAvatarSkillTree` / `getOfflineSkillTree` in server/storage.ts.
 */
export interface SkillNodeDto {
  id: string;
  skillKey: string;
  name: string;
  description: string;
  branch: string;
  maxLevel: number;
  currentLevel: number;
  nextCost: number | null;
  prerequisiteSkillKey: string | null;
  isUnlocked: boolean;
  isAvailable: boolean;
  effectType: string;
  effectPerLevel: number;
}

interface Wallet {
  balance: number;
}

const EFFECT_LABELS: Record<string, string> = {
  entourage_slots: "companion slots",
  guidance_depth: "guidance depth",
  context_points: "context points",
  resource_budget: "resource budget",
  export_coin_discount: "export discount",
  rate_pct: "% offline coin rate",
  capacity_hours: "h offline capacity",
};

function formatEffect(effectType: string, perLevel: number): string {
  const label = EFFECT_LABELS[effectType] ?? effectType.replace(/_/g, " ");
  if (effectType === "rate_pct") return `+${perLevel}% offline coin rate / level`;
  if (effectType === "capacity_hours") return `+${perLevel}h offline capacity / level`;
  if (effectType === "export_coin_discount") return `-${perLevel} coin export cost / level`;
  return `+${perLevel} ${label} / level`;
}

function apiPathFor(tree: SkillTreeKind): { list: string; unlock: string } {
  return tree === "avatar"
    ? { list: "/api/gamification/avatar-skills", unlock: "/api/gamification/avatar-skills/unlock" }
    : { list: "/api/gamification/offline-skills", unlock: "/api/gamification/offline-skills/unlock" };
}

export interface SkillTreeViewProps {
  tree: SkillTreeKind;
  /** If true, unlock buttons and the wallet row are hidden (used in the tutorial mini widget). */
  readOnly?: boolean;
  /** Tighter spacing and smaller type for the tutorial bubble. */
  compact?: boolean;
  className?: string;
}

/**
 * Renders the Avatar or Offline skill tree, grouped by branch, with prerequisite-gated nodes.
 * Consumers: the /skill-tree page and the inline tutorial mini widget.
 */
export function SkillTreeView({ tree, readOnly, compact, className }: SkillTreeViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { list: listPath, unlock: unlockPath } = apiPathFor(tree);

  const { data: nodes = [], isLoading } = useQuery<SkillNodeDto[]>({
    queryKey: [listPath],
  });

  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["/api/gamification/wallet"],
    enabled: !readOnly,
  });

  const unlockMutation = useMutation({
    mutationFn: async (vars: { skillKey: string; branch: string }) => {
      const res = await apiRequest("POST", unlockPath, { skillKey: vars.skillKey });
      return res.json() as Promise<{ ok: boolean; message: string }>;
    },
    onSuccess: (data, vars) => {
      void queryClient.invalidateQueries({ queryKey: [listPath] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      if (tree === "offline") {
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/offline-generator"] });
      }
      toast({
        title: "Skill upgraded",
        description: data.message ?? "Skill level increased.",
      });
      const nudgeSource = resolveSkillUnlockSource(tree, vars.skillKey, vars.branch);
      requestFeedbackNudge(nudgeSource);
    },
    onError: (err: Error) => {
      toast({ title: "Upgrade failed", description: err.message, variant: "destructive" });
    },
  });

  const branches = useMemo(() => {
    const byBranch = new Map<string, SkillNodeDto[]>();
    for (const node of nodes) {
      const list = byBranch.get(node.branch) ?? [];
      list.push(node);
      byBranch.set(node.branch, list);
    }
    for (const [, list] of byBranch) {
      list.sort((a, b) => {
        const depthA = depthOf(a, nodes);
        const depthB = depthOf(b, nodes);
        if (depthA !== depthB) return depthA - depthB;
        return a.name.localeCompare(b.name);
      });
    }
    return Array.from(byBranch.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [nodes]);

  if (isLoading) {
    return (
      <div className={cn("text-xs text-muted-foreground py-2", className)}>Loading skill tree…</div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground py-2", className)}>
        No skills available yet.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {!readOnly && wallet && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Coins className="h-4 w-4 text-amber-500" aria-hidden />
          <span>
            Balance:{" "}
            <span className="font-semibold text-foreground tabular-nums">{wallet.balance}</span>{" "}
            AxCoins
          </span>
        </div>
      )}

      <div
        className={cn(
          "grid gap-4",
          compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
        )}
      >
        {branches.map(([branch, branchNodes]) => (
          <div
            key={branch}
            className={cn(
              "rounded-xl border border-border bg-card/60 backdrop-blur",
              compact ? "p-2" : "p-3",
            )}
            data-testid={`skill-tree-branch-${branch}`}
          >
            <div
              className={cn(
                "flex items-center justify-between mb-2",
                compact ? "text-[11px]" : "text-xs",
              )}
            >
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                {branch}
              </span>
              <Badge variant="outline" className="h-5 px-2 text-[10px]">
                {branchNodes.length} skill{branchNodes.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <ul className="space-y-2">
              {branchNodes.map((node, i) => (
                <li key={node.id} className="relative">
                  {i > 0 && (
                    <div
                      aria-hidden
                      className="absolute left-4 -top-2 h-2 w-px bg-border"
                    />
                  )}
                  <SkillNodeCard
                    node={node}
                    tree={tree}
                    compact={compact}
                    readOnly={readOnly}
                    walletBalance={wallet?.balance ?? 0}
                    isPending={unlockMutation.isPending}
                    onUnlock={() =>
                      unlockMutation.mutate({ skillKey: node.skillKey, branch: node.branch })
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function depthOf(node: SkillNodeDto, all: SkillNodeDto[]): number {
  let depth = 0;
  let current = node;
  const seen = new Set<string>();
  while (current.prerequisiteSkillKey && !seen.has(current.skillKey)) {
    seen.add(current.skillKey);
    const parent = all.find((n) => n.skillKey === current.prerequisiteSkillKey);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

interface SkillNodeCardProps {
  node: SkillNodeDto;
  tree: SkillTreeKind;
  compact?: boolean;
  readOnly?: boolean;
  walletBalance: number;
  isPending: boolean;
  onUnlock: () => void;
}

function SkillNodeCard({
  node,
  tree,
  compact,
  readOnly,
  walletBalance,
  isPending,
  onUnlock,
}: SkillNodeCardProps) {
  const atMax = node.currentLevel >= node.maxLevel;
  const locked = !node.isAvailable && !node.isUnlocked;
  const canAfford = node.nextCost != null && walletBalance >= node.nextCost;

  let stateLabel: string;
  let stateTone: string;
  let StateIcon = Zap;
  if (atMax) {
    stateLabel = "Maxed";
    stateTone = "text-emerald-600 dark:text-emerald-400 border-emerald-500/40";
    StateIcon = Check;
  } else if (node.isUnlocked) {
    stateLabel = "Active";
    stateTone = "text-amber-600 dark:text-amber-400 border-amber-500/40";
    StateIcon = Zap;
  } else if (locked) {
    stateLabel = "Locked";
    stateTone = "text-muted-foreground border-border";
    StateIcon = Lock;
  } else {
    stateLabel = "Available";
    stateTone = "text-sky-600 dark:text-sky-400 border-sky-500/40";
    StateIcon = Zap;
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-background/60",
        compact ? "p-2" : "p-3",
        locked && "opacity-70",
      )}
      data-testid={`skill-node-${tree}-${node.skillKey}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={cn(
                "font-semibold text-foreground leading-tight truncate",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {node.name}
            </h4>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                stateTone,
              )}
            >
              <StateIcon className="h-2.5 w-2.5" aria-hidden />
              {stateLabel}
            </span>
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{node.description}</p>
          )}
          <p
            className={cn(
              "text-muted-foreground mt-1",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            {formatEffect(node.effectType, node.effectPerLevel)}
          </p>
          {node.prerequisiteSkillKey && !node.isUnlocked && !node.isAvailable && (
            <p className="text-[10px] text-muted-foreground/80 mt-1 italic">
              Requires: {node.prerequisiteSkillKey}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "font-semibold tabular-nums",
              compact ? "text-xs" : "text-sm",
            )}
            aria-label={`Level ${node.currentLevel} of ${node.maxLevel}`}
          >
            {node.currentLevel}
            <span className="text-muted-foreground">/{node.maxLevel}</span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            {node.nextCost != null ? (
              <>
                <Coins className="h-3 w-3 text-amber-500" aria-hidden />
                <span className="tabular-nums">{node.nextCost}</span>
                <span>coins next</span>
              </>
            ) : (
              <span>—</span>
            )}
          </span>
          <Button
            size="sm"
            variant={node.isUnlocked ? "outline" : "default"}
            disabled={atMax || locked || !canAfford || isPending || node.nextCost == null}
            onClick={onUnlock}
            className="h-7 px-2 text-[11px]"
            data-testid={`skill-unlock-${tree}-${node.skillKey}`}
          >
            {atMax
              ? "Maxed"
              : locked
                ? "Locked"
                : node.isUnlocked
                  ? "Upgrade"
                  : "Unlock"}
          </Button>
        </div>
      )}
    </div>
  );
}
