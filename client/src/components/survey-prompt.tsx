import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ThumbsUp, ThumbsDown, Coins, Send, MessageSquare } from "lucide-react";
import type { Survey } from "@shared/schema";

const SURVEY_DISMISS_KEY = "axtask_survey_dismiss";
const SURVEY_FIRST_VISIT_KEY = "axtask_first_visits";

function getDismissedSurveys(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SURVEY_DISMISS_KEY) || "{}");
  } catch { return {}; }
}

function dismissSurvey(surveyId: string) {
  const dismissed = getDismissedSurveys();
  dismissed[surveyId] = Date.now();
  localStorage.setItem(SURVEY_DISMISS_KEY, JSON.stringify(dismissed));
}

function isSurveyDismissed(surveyId: string, cooldownMs: number): boolean {
  const dismissed = getDismissedSurveys();
  if (!dismissed[surveyId]) return false;
  return Date.now() - dismissed[surveyId] < cooldownMs;
}

export function markFirstVisit(module: string): boolean {
  try {
    const visits = JSON.parse(localStorage.getItem(SURVEY_FIRST_VISIT_KEY) || "{}");
    if (visits[module]) return false;
    visits[module] = Date.now();
    localStorage.setItem(SURVEY_FIRST_VISIT_KEY, JSON.stringify(visits));
    return true;
  } catch { return false; }
}

interface SurveyPromptProps {
  targetModule?: string;
  trigger?: "page_visit" | "task_completion" | "periodic";
  active?: boolean;
}

export function SurveyPrompt({ targetModule, trigger = "periodic", active = true }: SurveyPromptProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
  const [textResponse, setTextResponse] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [triggerReady, setTriggerReady] = useState(false);

  useEffect(() => {
    if (trigger === "page_visit") {
      const isFirst = markFirstVisit(targetModule || "unknown");
      setTriggerReady(isFirst || Math.random() < 0.3);
    } else if (trigger === "task_completion") {
      setTriggerReady(active);
    } else {
      setTriggerReady(true);
    }
  }, [trigger, targetModule, active]);

  const { data: applicableSurveys = [] } = useQuery<Survey[]>({
    queryKey: ["/api/surveys", targetModule],
    queryFn: async () => {
      const params = targetModule ? `?module=${targetModule}` : "";
      const res = await fetch(`/api/surveys${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: triggerReady,
    refetchInterval: 300000,
  });

  useEffect(() => {
    if (dismissed || currentSurvey || !triggerReady) return;

    const available = applicableSurveys.filter(s => {
      const cooldownMs = (s.cooldownHours || 24) * 60 * 60 * 1000;
      return !isSurveyDismissed(s.id, cooldownMs);
    });

    if (available.length > 0) {
      const randomIdx = Math.floor(Math.random() * available.length);
      setCurrentSurvey(available[randomIdx]);
    }
  }, [applicableSurveys, dismissed, currentSurvey, triggerReady]);

  const respondMutation = useMutation({
    mutationFn: async ({ surveyId, response }: { surveyId: string; response: string }) => {
      const res = await apiRequest("POST", `/api/surveys/${surveyId}/respond`, { response });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      toast({
        title: `+${data.coinsEarned} AxCoins earned!`,
        description: "Thanks for your feedback!",
      });
      setCurrentSurvey(null);
      setTextResponse("");
      setSelectedOption(null);
    },
    onError: () => {
      toast({ title: "Failed to submit", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleDismiss = useCallback(() => {
    if (currentSurvey) {
      dismissSurvey(currentSurvey.id);
    }
    setCurrentSurvey(null);
    setDismissed(true);
  }, [currentSurvey]);

  const handleSubmit = useCallback((response: string) => {
    if (!currentSurvey || !response) return;
    respondMutation.mutate({ surveyId: currentSurvey.id, response });
  }, [currentSurvey, respondMutation]);

  if (!currentSurvey || dismissed) return null;

  return (
    <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-900/10 dark:to-indigo-900/10 relative">
      <button
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        onClick={handleDismiss}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {currentSurvey.question}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Coins className="h-3 w-3" />
              Earn {currentSurvey.coinReward} AxCoins for answering
            </p>
          </div>
        </div>

        {currentSurvey.promptType === "thumbs" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 gap-1.5 hover:bg-green-50 hover:border-green-300 dark:hover:bg-green-900/20"
              onClick={() => handleSubmit("thumbsUp")}
              disabled={respondMutation.isPending}
            >
              <ThumbsUp className="h-4 w-4 text-green-600" />
              Yes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 gap-1.5 hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-900/20"
              onClick={() => handleSubmit("thumbsDown")}
              disabled={respondMutation.isPending}
            >
              <ThumbsDown className="h-4 w-4 text-red-600" />
              No
            </Button>
          </div>
        )}

        {currentSurvey.promptType === "radio" && (
          <div className="space-y-1.5">
            {(currentSurvey.options as string[] || []).map((option) => (
              <button
                key={option}
                className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                  selectedOption === option
                    ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10"
                }`}
                onClick={() => setSelectedOption(option)}
              >
                {option}
              </button>
            ))}
            {selectedOption && (
              <Button
                size="sm"
                className="w-full mt-2"
                onClick={() => handleSubmit(selectedOption)}
                disabled={respondMutation.isPending}
              >
                Submit
              </Button>
            )}
          </div>
        )}

        {currentSurvey.promptType === "text" && (
          <div className="flex gap-2">
            <Input
              placeholder="Type your response..."
              value={textResponse}
              onChange={(e) => setTextResponse(e.target.value)}
              className="text-sm h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter" && textResponse.trim()) {
                  handleSubmit(textResponse.trim());
                }
              }}
            />
            <Button
              size="sm"
              className="h-9 px-3"
              onClick={() => handleSubmit(textResponse.trim())}
              disabled={!textResponse.trim() || respondMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TaskReactionProps {
  taskId: string;
  reactions: Record<string, string[]>;
  userId: string;
  compact?: boolean;
}

export function TaskReaction({ taskId, reactions, userId, compact = false }: TaskReactionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const thumbsUp = reactions?.thumbsUp || [];
  const thumbsDown = reactions?.thumbsDown || [];
  const hasReactedUp = thumbsUp.includes(userId);
  const hasReactedDown = thumbsDown.includes(userId);

  const reactMutation = useMutation({
    mutationFn: async (reaction: "thumbsUp" | "thumbsDown") => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/react`, { reaction });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (data.coinsEarned > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
        toast({
          title: `+${data.coinsEarned} AxCoin`,
          description: "Thanks for the feedback!",
        });
      }
    },
  });

  if (compact) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          className={`p-1 rounded transition-colors ${
            hasReactedUp ? "text-green-600 bg-green-50 dark:bg-green-900/20" : "text-muted-foreground hover:text-green-600"
          }`}
          onClick={() => reactMutation.mutate("thumbsUp")}
          disabled={reactMutation.isPending}
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        {thumbsUp.length > 0 && (
          <span className="text-[10px] text-green-600 tabular-nums">{thumbsUp.length}</span>
        )}
        <button
          className={`p-1 rounded transition-colors ${
            hasReactedDown ? "text-red-600 bg-red-50 dark:bg-red-900/20" : "text-muted-foreground hover:text-red-600"
          }`}
          onClick={() => reactMutation.mutate("thumbsDown")}
          disabled={reactMutation.isPending}
        >
          <ThumbsDown className="h-3 w-3" />
        </button>
        {thumbsDown.length > 0 && (
          <span className="text-[10px] text-red-600 tabular-nums">{thumbsDown.length}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-2 gap-1 ${hasReactedUp ? "text-green-600 bg-green-50 dark:bg-green-900/20" : ""}`}
        onClick={() => reactMutation.mutate("thumbsUp")}
        disabled={reactMutation.isPending}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        {thumbsUp.length > 0 && <span className="text-xs tabular-nums">{thumbsUp.length}</span>}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-2 gap-1 ${hasReactedDown ? "text-red-600 bg-red-50 dark:bg-red-900/20" : ""}`}
        onClick={() => reactMutation.mutate("thumbsDown")}
        disabled={reactMutation.isPending}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        {thumbsDown.length > 0 && <span className="text-xs tabular-nums">{thumbsDown.length}</span>}
      </Button>
    </div>
  );
}
