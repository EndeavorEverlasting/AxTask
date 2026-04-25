import { lazy, Suspense, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { resolveSkillUnlockSource } from "@/lib/skill-tree-feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Coins, Lock, Check, Zap } from "lucide-react";
import { formatSkillEffect } from "@/lib/skill-tree-format";
import {
  gamificationSkillTreeApiPaths as apiPathFor,
  type SkillTreeKind,
} from "@/lib/skill-tree-paths";

/** Matches `OFFLINE_GENERATOR_BASE_COST` in server/storage.ts */
const OFFLINE_GENERATOR_PURCHASE_COST = 500;

const SkillTreeGraph = lazy(() =>
  import("./skill-tree-graph").then((m) => ({ default: m.SkillTreeGraph })),
);

export type { SkillTreeKind };

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
  /** Present when merging avatar + offline into one canvas. */
  domain?: SkillTreeKind;
}

interface Wallet {
  balance: number;
}

export interface SkillTreeViewProps {
  tree: SkillTreeKind;
  /** If true, unlock buttons and the wallet row are hidden (used in the tutorial mini widget). */
  readOnly?: boolean;
  /** Tighter spacing and smaller type for the tutorial bubble. */
  compact?: boolean;
  className?: string;
}

export interface UnifiedSkillTreeViewProps {
  /** If true, unlock buttons and the wallet row are hidden (used in read-only previews). */
  readOnly?: boolean;
  compact?: boolean;
  className?: string;
}

function useSkillUnlockMutation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { skillKey: string; branch: string; domain: SkillTreeKind }) => {
      const { unlock } = apiPathFor(vars.domain);
      const res = await apiRequest("POST", unlock, { skillKey: vars.skillKey });
      return res.json() as Promise<{ ok: boolean; message: string }>;
    },
    onSuccess: (data, vars) => {
      const { list } = apiPathFor(vars.domain);
      void queryClient.invalidateQueries({ queryKey: [list] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      if (vars.domain === "offline") {
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/offline-generator"] });
      }
      if (!data.ok) {
        toast({
          title: "Upgrade failed",
          description: data.message ?? "Could not upgrade this skill.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Skill upgraded",
        description: data.message ?? "Skill level increased.",
      });
      const nudgeSource = resolveSkillUnlockSource(vars.domain, vars.skillKey, vars.branch);
      requestFeedbackNudge(nudgeSource);
    },
    onError: (err: Error) => {
      toast({ title: "Upgrade failed", description: err.message, variant: "destructive" });
    },
  });
}

/**
 * Renders the Avatar or Offline skill tree, grouped by branch, with prerequisite-gated nodes.
 * Consumers: the inline tutorial mini widget and legacy single-tree mode.
 */
export function SkillTreeView({ tree, readOnly, compact, className }: SkillTreeViewProps) {
  const { list: listPath } = apiPathFor(tree);

  const { data: rawNodes = [], isLoading } = useQuery<SkillNodeDto[]>({
    queryKey: [listPath],
  });

  const nodes = useMemo(() => rawNodes.map((n) => ({ ...n, domain: tree })), [rawNodes, tree]);

  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["/api/gamification/wallet"],
    enabled: !readOnly,
  });

  const unlockMutation = useSkillUnlockMutation();

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

  if (rawNodes.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground py-2", className)}>
        No skills available yet.
      </div>
    );
  }

  const showFullGraph = !compact && !readOnly;

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

      {showFullGraph ? (
        <Suspense
          fallback={
            <div className="text-xs text-muted-foreground py-12 text-center rounded-xl border border-dashed border-border">
              Loading skill graph…
            </div>
          }
        >
          <SkillTreeGraph
            tree={tree}
            nodes={nodes}
            walletBalance={wallet?.balance ?? 0}
            readOnly={readOnly ?? false}
            isPending={unlockMutation.isPending}
            onUnlock={(skillKey, branch, domain) =>
              unlockMutation.mutate({ skillKey, branch, domain })
            }
          />
        </Suspense>
      ) : null}

      {!showFullGraph ? (
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
                "rounded-xl border border-border bg-card/85",
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
                      tree={node.domain ?? tree}
                      compact={compact}
                      readOnly={readOnly}
                      walletBalance={wallet?.balance ?? 0}
                      isPending={unlockMutation.isPending}
                      onUnlock={() =>
                        unlockMutation.mutate({
                          skillKey: node.skillKey,
                          branch: node.branch,
                          domain: node.domain ?? tree,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One Pretext Flow canvas: companion / productivity skills and idle generator skills side by side.
 */
export function UnifiedSkillTreeView({ readOnly, compact, className }: UnifiedSkillTreeViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: avatarRaw = [], isLoading: loadingAvatar } = useQuery<SkillNodeDto[]>({
    queryKey: ["/api/gamification/avatar-skills"],
  });
  const { data: offlineRaw = [], isLoading: loadingOffline } = useQuery<SkillNodeDto[]>({
    queryKey: ["/api/gamification/offline-skills"],
  });

  const { data: offlineGen } = useQuery<{ generator: { isOwned: boolean } }>({
    queryKey: ["/api/gamification/offline-generator"],
    enabled: !readOnly,
  });

  const buyGeneratorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gamification/offline-generator/buy", {});
      return res.json() as Promise<{ ok: boolean; message: string }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/offline-generator"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/offline-skills"] });
      if (data.ok) {
        toast({
          title: "Offline generator online",
          description: data.message ?? "You can unlock idle skills.",
        });
      } else {
        toast({
          title: "Purchase not completed",
          description: data.message ?? "Could not buy the offline generator.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    },
  });

  const nodes = useMemo(
    () => [
      ...avatarRaw.map((n) => ({ ...n, domain: "avatar" as const })),
      ...offlineRaw.map((n) => ({ ...n, domain: "offline" as const })),
    ],
    [avatarRaw, offlineRaw],
  );

  const unlockMutation = useSkillUnlockMutation();

  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["/api/gamification/wallet"],
    enabled: !readOnly,
  });

  const unifiedBranches = useMemo(() => {
    const byKey = new Map<string, SkillNodeDto[]>();
    for (const node of nodes) {
      const domain = node.domain ?? "avatar";
      const key = `${domain}::${node.branch}`;
      const list = byKey.get(key) ?? [];
      list.push(node);
      byKey.set(key, list);
    }
    for (const [, list] of byKey) {
      list.sort((a, b) => {
        const depthA = depthOf(a, nodes);
        const depthB = depthOf(b, nodes);
        if (depthA !== depthB) return depthA - depthB;
        return a.name.localeCompare(b.name);
      });
    }
    return Array.from(byKey.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [nodes]);

  const isLoading = loadingAvatar || loadingOffline;
  const showFullGraph = !compact && !readOnly;
  const genOwned = offlineGen?.generator.isOwned ?? false;

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

      {!readOnly && !genOwned && (
        <Alert
          className="border-cyan-500/30 bg-cyan-950/10"
          data-testid="skill-tree-offline-generator-callout"
        >
          <Zap className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden />
          <AlertTitle>Idle skills need the offline generator</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Buy the background generator for{" "}
              <span className="font-semibold tabular-nums">{OFFLINE_GENERATOR_PURCHASE_COST}</span>{" "}
              AxCoins to unlock and upgrade idle rate and capacity nodes on the right side of the tree.
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0"
              disabled={buyGeneratorMutation.isPending}
              onClick={() => buyGeneratorMutation.mutate()}
              data-testid="skill-tree-buy-offline-generator"
            >
              Buy generator
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showFullGraph ? (
        <Suspense
          fallback={
            <div className="text-xs text-muted-foreground py-12 text-center rounded-xl border border-dashed border-border">
              Loading skill graph…
            </div>
          }
        >
          <SkillTreeGraph
            tree="avatar"
            nodes={nodes}
            walletBalance={wallet?.balance ?? 0}
            readOnly={readOnly ?? false}
            isPending={unlockMutation.isPending || buyGeneratorMutation.isPending}
            showRegionPanels
            onUnlock={(skillKey, branch, domain) =>
              unlockMutation.mutate({ skillKey, branch, domain })
            }
          />
        </Suspense>
      ) : null}

      {!showFullGraph ? (
        <div
          className={cn(
            "grid gap-4",
            compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
          )}
        >
          {unifiedBranches.map(([branchKey, branchNodes]) => {
            const sep = branchKey.indexOf("::");
            const domain = sep === -1 ? branchKey : branchKey.slice(0, sep);
            const branch = sep === -1 ? "" : branchKey.slice(sep + 2);
            const domainLabel = domain === "offline" ? "Idle" : "Avatar";
            return (
              <div
                key={branchKey}
                className={cn(
                  "rounded-xl border border-border bg-card/85",
                  compact ? "p-2" : "p-3",
                )}
                data-testid={`skill-tree-branch-${branchKey}`}
              >
                <div
                  className={cn(
                    "flex items-center justify-between mb-2",
                    compact ? "text-[11px]" : "text-xs",
                  )}
                >
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {domainLabel} · {branch}
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
                        tree={node.domain ?? "avatar"}
                        compact={compact}
                        readOnly={readOnly}
                        walletBalance={wallet?.balance ?? 0}
                        isPending={unlockMutation.isPending}
                        onUnlock={() =>
                          unlockMutation.mutate({
                            skillKey: node.skillKey,
                            branch: node.branch,
                            domain: node.domain ?? "avatar",
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
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
            {formatSkillEffect(node.effectType, node.effectPerLevel)}
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
