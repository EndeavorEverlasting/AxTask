import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { syncRawTaskRequest, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";
import { requestFeedbackNudge } from "@/lib/feedback-nudge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Coins, Plus, Sparkles } from "lucide-react";
import { BUILT_IN_CLASSIFICATIONS } from "@shared/classification-catalog";
import type { ClassificationAssociation } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CategoriesResponse = {
  builtIn: { label: string; coins: number }[];
  custom: { id: string; label: string; coins: number }[];
};

type SuggestionsResponse = {
  suggestions: { label: string; confidence: number; source: string }[];
};

function mergeCategoryRows(resp: CategoriesResponse): { label: string; coins: number }[] {
  const built = resp.builtIn.map((b) => ({ label: b.label, coins: b.coins }));
  const custom = resp.custom.map((c) => ({ label: c.label, coins: c.coins }));
  return [...built, ...custom];
}

export function getClassificationColor(classification: string) {
  switch (classification) {
    case "Crisis":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "Development":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Meeting":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Administrative":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "Research":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "Maintenance":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
  }
}

interface ClassificationBadgeProps {
  classification: string;
  /** Multi-label model from API; primary remains `classification`. */
  classificationAssociations?: ClassificationAssociation[] | null;
  taskId?: string;
  editable?: boolean;
  /** Used with NodeWeaver / AxTask suggestions when the popover opens. */
  activity?: string;
  notes?: string;
  /** Task's current updatedAt for optimistic concurrency checks on reclassify. */
  baseUpdatedAt?: string;
}

export function ClassificationBadge({
  classification,
  classificationAssociations,
  taskId,
  editable = false,
  activity = "",
  notes = "",
  baseUpdatedAt,
}: ClassificationBadgeProps) {
  const [open, setOpen] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(() => new Set());
  const prevOpenRef = useRef(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const { playIfEligible } = useImmersiveSounds();

  const categoriesQuery = useQuery({
    queryKey: ["/api/classification/categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/classification/categories");
      return res.json() as Promise<CategoriesResponse>;
    },
    enabled: Boolean(editable && taskId && open),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const base =
        classificationAssociations && classificationAssociations.length > 0
          ? classificationAssociations.map((a) => a.label)
          : [classification];
      setSelectedLabels(new Set(base));
    }
    prevOpenRef.current = open;
  }, [open, classification, classificationAssociations]);

  const suggestionsQuery = useQuery({
    queryKey: ["/api/classification/suggestions", taskId, activity, notes],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/classification/suggestions", {
        activity: activity.trim(),
        notes: notes || "",
      });
      return res.json() as Promise<SuggestionsResponse>;
    },
    enabled: Boolean(editable && taskId && open && activity.trim().length > 0),
    staleTime: 15_000,
  });

  const categoryRows = useMemo(() => {
    if (!categoriesQuery.data) {
      return BUILT_IN_CLASSIFICATIONS.map((c) => ({ label: c.label, coins: c.coins }));
    }
    return mergeCategoryRows(categoriesQuery.data);
  }, [categoriesQuery.data]);

  const coinByLabel = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of categoryRows) {
      m.set(row.label.toLowerCase(), row.coins);
    }
    return m;
  }, [categoryRows]);

  const topSuggestions = useMemo(() => {
    const list = suggestionsQuery.data?.suggestions ?? [];
    return list
      .filter((s) => s.label.toLowerCase() !== classification.toLowerCase())
      .slice(0, 4);
  }, [suggestionsQuery.data, classification]);

  const reclassifyMutation = useMutation({
    mutationFn: async (input: string | { associations: ClassificationAssociation[] }) => {
      const payload: Record<string, unknown> =
        typeof input === "string"
          ? { classification: input }
          : { associations: input.associations };
      if (baseUpdatedAt) payload.baseUpdatedAt = baseUpdatedAt;
      return syncRawTaskRequest(
        "POST",
        `/api/tasks/${taskId}/reclassify`,
        payload,
        queryClientHook,
      );
    },
    onSuccess: (result) => {
      if (result && typeof result === "object" && "offlineQueued" in result) {
        toast({
          title: "Queued",
          description: "Reclassification will sync when you're online.",
        });
        setOpen(false);
        return;
      }
      queryClientHook.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClientHook.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      queryClientHook.invalidateQueries({ queryKey: ["/api/gamification/classification-stats"] });
      queryClientHook.invalidateQueries({ queryKey: ["/api/gamification/badges"] });
      queryClientHook.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      queryClientHook.invalidateQueries({ queryKey: ["/api/tasks", taskId, "classifications"] });

      const r = result as {
        classification: string;
        classificationReward?: { coinsEarned: number; classification: string; newBalance: number };
        consensusCorrectionReward?: { coins: number; newBalance: number } | null;
      };
      if (r.classificationReward) {
        const cr = r.classificationReward;
        toast({
          title: `Reclassified! +${cr.coinsEarned} coins`,
          description: r.consensusCorrectionReward
            ? `Primary topic: ${cr.classification}. +${r.consensusCorrectionReward.coins} consensus bonus. Balance: ${r.consensusCorrectionReward.newBalance}`
            : `Primary topic: ${cr.classification}. Balance: ${cr.newBalance}`,
        });
        playIfEligible(1);
      } else {
        toast({
          title: "Topics updated",
          description: `Primary label: ${r.classification}. Multi-label weights saved (coins apply when the primary topic changes).`,
        });
        playIfEligible(3);
      }
      requestFeedbackNudge("classification_reclassify");
      setOpen(false);
    },
    onError: (err: unknown) => {
      if (err instanceof TaskSyncAbortedError) return;
      const message = err instanceof Error ? err.message : "Could not reclassify this task.";
      toast({
        title: "Reclassification failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      return syncRawTaskRequest("POST", "/api/classification/categories", { name }, queryClientHook);
    },
    onSuccess: (result) => {
      if (result && typeof result === "object" && "offlineQueued" in result) {
        setNewCategoryName("");
        toast({
          title: "Queued",
          description: "New category will sync when you're online.",
        });
        return;
      }
      setNewCategoryName("");
      queryClientHook.invalidateQueries({ queryKey: ["/api/classification/categories"] });
      toast({ title: "Category added", description: "It appears in your list for future tasks." });
    },
    onError: (err: unknown) => {
      if (err instanceof TaskSyncAbortedError) return;
      const message = err instanceof Error ? err.message : "Could not add category.";
      toast({ title: "Add category failed", description: message, variant: "destructive" });
    },
  });

  const coinsFor = (label: string) => coinByLabel.get(label.toLowerCase()) ?? 5;

  const toggleLabel = (label: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        if (next.size <= 1) return next;
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const applySelectedLabels = () => {
    const fromCatalog = categoryRows.filter((c) => selectedLabels.has(c.label)).map((c) => c.label);
    const extra = Array.from(selectedLabels).filter((l) => !fromCatalog.includes(l));
    const labels = [...fromCatalog, ...extra.sort((a, b) => a.localeCompare(b))];
    if (labels.length === 0) return;
    const n = labels.length;
    const associations: ClassificationAssociation[] = labels.map((label) => ({
      label,
      confidence: Math.round((1 / n) * 1000) / 1000,
    }));
    reclassifyMutation.mutate({ associations });
  };

  const associationAlts = (classificationAssociations ?? []).filter(
    (a) => a.label.trim().toLowerCase() !== classification.trim().toLowerCase(),
  );
  const hasAssociationDetail =
    (classificationAssociations?.length ?? 0) > 1 || associationAlts.length > 0;

  const associationTooltip = hasAssociationDetail ? (
    <div className="text-xs space-y-1 max-w-[220px]">
      <p className="font-medium text-foreground">Labels & confidence</p>
      {(classificationAssociations ?? [{ label: classification, confidence: 1 }]).map((a) => (
        <div key={a.label} className="flex justify-between gap-3 tabular-nums">
          <span className={a.label === classification ? "font-semibold" : ""}>{a.label}</span>
          <span className="text-muted-foreground">{Math.round(a.confidence * 100)}%</span>
        </div>
      ))}
    </div>
  ) : null;

  if (!editable || !taskId) {
    const pill = (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getClassificationColor(classification)}`}
      >
        {classification}
        {hasAssociationDetail && (
          <span className="text-[10px] opacity-80 font-normal tabular-nums">+{associationAlts.length || 0}</span>
        )}
      </span>
    );
    if (!associationTooltip) return pill;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{pill}</TooltipTrigger>
          <TooltipContent side="top">{associationTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-amber-400/50 dark:hover:ring-offset-gray-900 transition-all min-h-[28px] ${getClassificationColor(classification)}`}
          onClick={(e) => e.stopPropagation()}
        >
          {classification}
          {hasAssociationDetail && (
            <span className="text-[10px] opacity-80 font-normal tabular-nums">+{associationAlts.length || 0}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {hasAssociationDetail && (
          <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
              Multi-label confidence
            </div>
            <div className="px-2 space-y-1 text-xs">
              {(classificationAssociations ?? [{ label: classification, confidence: 1 }]).map((a) => (
                <div key={`${a.label}-${a.confidence}`} className="flex justify-between gap-2 tabular-nums">
                  <span className={a.label === classification ? "font-semibold text-foreground" : ""}>{a.label}</span>
                  <span className="text-muted-foreground">{Math.round(a.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {activity.trim().length > 0 && (
          <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
              AI Suggestions
            </div>
            {suggestionsQuery.isLoading && (
              <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">Loading suggestions…</div>
            )}
            {suggestionsQuery.isError && (
              <div className="text-xs text-amber-800/90 dark:text-amber-200/90 px-2 py-1">
                Could not load suggestions. Check your connection — they refresh when you reopen this panel after editing the task text.
              </div>
            )}
            {!suggestionsQuery.isLoading && !suggestionsQuery.isError && topSuggestions.length === 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">No alternate suggestions.</div>
            )}
            {topSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topSuggestions.map((s, idx) => (
                  <Button
                    key={`${s.label}-${s.source}-${idx}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs px-3 min-w-[80px] hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700"
                    disabled={reclassifyMutation.isPending}
                    title={
                      s.source === "nodeweaver"
                        ? "Suggested by NodeWeaver AI"
                        : s.source === "catalog"
                          ? "From your category list"
                          : "Suggested by AxTask classifier"
                    }
                    onClick={() => reclassifyMutation.mutate(s.label)}
                  >
                    <Sparkles className="h-3 w-3 mr-1 opacity-60" />
                    {s.label}
                    <span className="ml-1.5 text-[10px] opacity-60 tabular-nums">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
          Your categories (multi-select)
        </div>
        <p className="text-[10px] text-muted-foreground px-2 pb-1 leading-snug">
          Check one or more topics; the first row after save is the primary label (highest weight). Equal split for now — refine with quick single-topic picks above.
        </p>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {categoriesQuery.isLoading && (
            <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-2">Loading categories...</div>
          )}
          {!categoriesQuery.isLoading &&
            categoryRows.map((cat) => (
              <label
                key={cat.label}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm min-h-[40px] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-400 shrink-0"
                    checked={selectedLabels.has(cat.label)}
                    disabled={reclassifyMutation.isPending}
                    onChange={() => toggleLabel(cat.label)}
                  />
                  <span
                    className={`inline-block w-3 h-3 rounded-full shrink-0 ${getClassificationColor(cat.label).split(" ")[0]}`}
                  />
                  <span className="font-medium truncate">{cat.label}</span>
                </span>
                {coinsFor(cat.label) > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold tabular-nums shrink-0">
                    <Coins className="h-3.5 w-3.5" />
                    +{coinsFor(cat.label)}
                  </span>
                )}
              </label>
            ))}
        </div>
        <Button
          type="button"
          className="w-full mt-2"
          size="sm"
          disabled={reclassifyMutation.isPending || selectedLabels.size === 0}
          onClick={applySelectedLabels}
        >
          Apply selected labels
        </Button>

        <div className="mt-2 pt-2 border-t border-gray-200/80 dark:border-gray-700/80 px-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
            <Plus className="h-3 w-3" />
            New category
          </div>
          <div className="flex gap-1.5">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Name"
              className="h-8 text-xs"
              maxLength={48}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (addCategoryMutation.isPending) return;
                const n = newCategoryName.trim();
                if (n.length < 2) return;
                e.preventDefault();
                addCategoryMutation.mutate(n);
              }}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-2 shrink-0"
              disabled={newCategoryName.trim().length < 2 || addCategoryMutation.isPending}
              onClick={() => addCategoryMutation.mutate(newCategoryName.trim())}
            >
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
