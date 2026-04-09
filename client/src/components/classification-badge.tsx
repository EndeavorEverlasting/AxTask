import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { syncRawTaskRequest, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { useImmersiveSounds } from "@/hooks/use-immersive-sounds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Coins, Plus, Sparkles } from "lucide-react";
import { BUILT_IN_CLASSIFICATIONS } from "@shared/classification-catalog";

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
  taskId,
  editable = false,
  activity = "",
  notes = "",
  baseUpdatedAt,
}: ClassificationBadgeProps) {
  const [open, setOpen] = useState(false);
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
    mutationFn: async (newClassification: string) => {
      const payload: Record<string, string> = { classification: newClassification };
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
      };
      if (r.classificationReward) {
        const cr = r.classificationReward;
        toast({
          title: `Reclassified! +${cr.coinsEarned} coins`,
          description: `Now classified as ${cr.classification}. Balance: ${cr.newBalance}`,
        });
        playIfEligible(1);
      } else {
        toast({
          title: "Reclassified",
          description: `Task is now classified as ${r.classification}`,
        });
        playIfEligible(3);
      }
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

  const isCurrent = (label: string) => label.toLowerCase() === classification.toLowerCase();

  if (!editable || !taskId) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getClassificationColor(classification)}`}
      >
        {classification}
      </span>
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
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {activity.trim().length > 0 && (
          <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
              AI Suggestions
            </div>
            {suggestionsQuery.isLoading && (
              <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">Loading suggestions…</div>
            )}
            {suggestionsQuery.isError && (
              <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">Suggestions unavailable offline.</div>
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
          Your Categories
        </div>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {categoriesQuery.isLoading && (
            <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-2">Loading categories...</div>
          )}
          {!categoriesQuery.isLoading &&
            categoryRows.map((cat) => (
              <button
                key={cat.label}
                type="button"
                disabled={isCurrent(cat.label) || reclassifyMutation.isPending}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm min-h-[40px] transition-colors ${
                  isCurrent(cat.label)
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-default"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 cursor-pointer active:bg-gray-100 dark:active:bg-gray-700"
                }`}
                onClick={() => reclassifyMutation.mutate(cat.label)}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${getClassificationColor(cat.label).split(" ")[0]}`}
                  />
                  <span className="font-medium">{cat.label}</span>
                </span>
                {coinsFor(cat.label) > 0 && !isCurrent(cat.label) && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                    <Coins className="h-3.5 w-3.5" />
                    +{coinsFor(cat.label)}
                  </span>
                )}
              </button>
            ))}
        </div>

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
