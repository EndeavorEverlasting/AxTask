import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Coins, Pencil } from "lucide-react";

const CATEGORIES = [
  { label: "Crisis", coins: 15 },
  { label: "Research", coins: 12 },
  { label: "Development", coins: 10 },
  { label: "Meeting", coins: 8 },
  { label: "Maintenance", coins: 8 },
  { label: "Administrative", coins: 6 },
  { label: "General", coins: 0 },
] as const;

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

const CLASSIFY_HINT_KEY = "axtask_classify_hint_seen";
let hintDismissedThisSession = false;
let hintClaimedBy: string | null = null;

interface ClassificationBadgeProps {
  classification: string;
  taskId?: string;
  editable?: boolean;
}

export function ClassificationBadge({ classification, taskId, editable = false }: ClassificationBadgeProps) {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!editable || hintDismissedThisSession || !taskId) return;
    if (hintClaimedBy && hintClaimedBy !== taskId) return;
    try {
      if (localStorage.getItem(CLASSIFY_HINT_KEY) !== "true") {
        hintClaimedBy = taskId;
        setShowHint(true);
      }
    } catch {}
  }, [editable, taskId]);

  const dismissHint = () => {
    setShowHint(false);
    hintDismissedThisSession = true;
    try { localStorage.setItem(CLASSIFY_HINT_KEY, "true"); } catch {}
  };

  const reclassifyMutation = useMutation({
    mutationFn: async (newClassification: string) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/reclassify`, { classification: newClassification });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "classifications"] });

      if (result.classificationReward) {
        const cr = result.classificationReward;
        toast({
          title: `Reclassified! +${cr.coinsEarned} coins`,
          description: `Now classified as ${cr.classification}. Balance: ${cr.newBalance}`,
        });
      } else {
        toast({
          title: "Reclassified",
          description: `Task is now classified as ${result.classification}`,
        });
      }
      setOpen(false);
      dismissHint();
    },
    onError: (err: Error) => {
      toast({
        title: "Reclassification failed",
        description: err.message || "Could not reclassify this task.",
        variant: "destructive",
      });
    },
  });

  if (!editable || !taskId) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getClassificationColor(classification)}`}>
        {classification}
      </span>
    );
  }

  return (
    <div className="relative inline-flex">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) dismissHint(); }}>
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-amber-400/50 dark:hover:ring-offset-gray-900 transition-all min-h-[28px] group ${getClassificationColor(classification)}`}
            onClick={(e) => { e.stopPropagation(); dismissHint(); }}
            title="Classify to earn coins"
          >
            <Pencil className="h-2.5 w-2.5 opacity-40 group-hover:opacity-70 transition-opacity -ml-0.5 mr-0.5" />
            {classification}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-2"
          align="start"
          side="bottom"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
            Classify to earn coins
          </div>
          <div className="space-y-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                disabled={cat.label === classification || reclassifyMutation.isPending}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm min-h-[36px] transition-colors ${
                  cat.label === classification
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-default"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 cursor-pointer"
                }`}
                onClick={() => reclassifyMutation.mutate(cat.label)}
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${getClassificationColor(cat.label).split(" ")[0]}`} />
                  {cat.label}
                </span>
                {cat.coins > 0 && cat.label !== classification && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    <Coins className="h-3 w-3" />
                    +{cat.coins}
                  </span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {showHint && !open && (
        <div
          className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-50 animate-in fade-in slide-in-from-bottom-1 duration-300"
          onClick={(e) => { e.stopPropagation(); dismissHint(); }}
        >
          <div className="bg-amber-600 text-white text-[10px] font-medium px-2 py-1 rounded-md shadow-lg flex items-center gap-1">
            <Coins className="h-3 w-3" />
            Tap to classify & earn coins!
          </div>
          <div className="w-2 h-2 bg-amber-600 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}
