import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useSpeechRecognition, type SpeechStatus } from "./use-speech-recognition";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Task } from "@shared/schema";
import { hasNavigationLeadIn, matchNavigationPath } from "@shared/voice-dispatch";
import { syncUpdateTask, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { useLiveClassificationStream, type LiveClassificationSuggestion } from "./use-live-classification-stream";
import { TUTORIAL_STEPS, useTutorial } from "@/hooks/use-tutorial";
import { matchVoiceShortcut } from "@/lib/voice-shortcuts";

interface EngineResponse {
  intent: string;
  action: string;
  payload: Record<string, unknown>;
  message: string;
}

export interface TaskPrefill {
  activity: string;
  date?: string;
  time?: string;
}

export interface ReviewProposal {
  actions: Array<{
    type: "complete" | "reschedule" | "update";
    taskId: string;
    taskActivity: string;
    details: Record<string, unknown>;
    confidence: number;
    reason: string;
  }>;
  unmatched: string[];
  message: string;
}

function isReviewProposalAction(x: unknown): x is ReviewProposal["actions"][number] {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const type = o.type;
  if (type !== "complete" && type !== "reschedule" && type !== "update") return false;
  if (typeof o.taskId !== "string" || o.taskId.length === 0) return false;
  if (typeof o.taskActivity !== "string") return false;
  if (!o.details || typeof o.details !== "object" || Array.isArray(o.details)) return false;
  if (typeof o.confidence !== "number" || !Number.isFinite(o.confidence)) return false;
  if (typeof o.reason !== "string") return false;
  return true;
}

interface VoiceContextType {
  isSupported: boolean;
  status: SpeechStatus;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isBarOpen: boolean;
  lastResponse: EngineResponse | null;
  isProcessing: boolean;
  taskPrefill: TaskPrefill | null;
  voiceSearchQuery: string | null;
  reviewProposal: ReviewProposal | null;
  /** Live topic hints while the command mic is listening (SSE + debounced classify). */
  liveTopicSuggestions: LiveClassificationSuggestion[];
  liveTopicLoading: boolean;
  toggleListening: () => void;
  openBar: () => void;
  /** Opens the voice bar then starts listening on the next microtask (avoids racing openBar). */
  openBarAndToggleListening: () => void;
  closeBar: () => void;
  toggleBar: () => void;
  clearResponse: () => void;
  consumeTaskPrefill: () => TaskPrefill | null;
  consumeVoiceSearch: () => string | null;
  clearReviewProposal: () => void;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}

interface VoiceProviderProps {
  children: ReactNode;
  onNavigate?: (path: string) => void;
}

export function VoiceProvider({ children, onNavigate }: VoiceProviderProps) {
  const [isBarOpen, setIsBarOpen] = useState(false);
  const [lastResponse, setLastResponse] = useState<EngineResponse | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState<string | null>(null);
  const [reviewProposal, setReviewProposal] = useState<ReviewProposal | null>(null);
  const { toast } = useToast();
  const { startTutorial, jumpToStepById } = useTutorial();
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const pendingSearchDictationRef = useRef(false);
  const speechRef = useRef<{ resetTranscript: () => void; start: () => void } | null>(null);

  const processMutation = useMutation({
    mutationFn: async (transcript: string) => {
      const res = await apiRequest("POST", "/api/voice/process", { transcript });
      return res.json() as Promise<EngineResponse>;
    },
    onSuccess: (data) => {
      setLastResponse(data);

      switch (data.action) {
        case "navigate":
          onNavigateRef.current?.(data.payload.path as string);
          break;
        case "open_new_task": {
          const prefill: TaskPrefill = {
            activity: (data.payload.activity as string) || "",
            date: data.payload.date as string | undefined,
            time: data.payload.time as string | undefined,
          };
          setTaskPrefill(prefill);
          onNavigateRef.current?.("/tasks?new=1");
          break;
        }
        case "prefill_task": {
          const prefill: TaskPrefill = {
            activity: (data.payload.activity as string) || "",
            date: data.payload.date as string | undefined,
            time: data.payload.time as string | undefined,
          };
          setTaskPrefill(prefill);
          onNavigateRef.current?.("/tasks?new=1");
          break;
        }
        case "tutorial_start":
          startTutorial();
          break;
        case "tutorial_jump": {
          const stepId = data.payload.stepId as string;
          const ok = jumpToStepById(stepId);
          if (!ok) {
            startTutorial();
            break;
          }
          const step = TUTORIAL_STEPS.find((s) => s.id === stepId);
          if (step?.page) onNavigateRef.current?.(step.page);
          break;
        }
        case "prepare_task_search": {
          pendingSearchDictationRef.current = true;
          onNavigateRef.current?.("/tasks");
          window.dispatchEvent(new CustomEvent("axtask-voice-focus-task-search"));
          const sp = speechRef.current;
          window.setTimeout(() => {
            sp?.resetTranscript();
            sp?.start();
          }, 200);
          break;
        }
        case "reschedule_task": {
          const taskId = data.payload.taskId as string;
          const newDate = data.payload.newDate as string;
          void (async () => {
            let base: Task | undefined = queryClient.getQueryData<Task[]>(["/api/tasks"])?.find((t) => t.id === taskId);
            if (!base) {
              try {
                base = await queryClient.fetchQuery({
                  queryKey: ["/api/tasks", taskId],
                  queryFn: async () => {
                    const res = await apiRequest("GET", `/api/tasks/${taskId}`);
                    if (!res.ok) {
                      const t = await res.text();
                      throw new Error(t || res.statusText);
                    }
                    return res.json() as Promise<Task>;
                  },
                });
              } catch {
                toast({
                  title: "Error",
                  description: "Could not load that task. It may have been removed.",
                  variant: "destructive",
                });
                return;
              }
            }
            if (!base) {
              toast({ title: "Error", description: "Task not found.", variant: "destructive" });
              return;
            }
            try {
              const r = await syncUpdateTask(taskId, { date: newDate }, base, queryClient);
              const d = r as { offlineQueued?: boolean } | undefined;
              if (d?.offlineQueued) {
                toast({ title: "Saved offline", description: "Reschedule will sync when you're online." });
                return;
              }
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
              toast({ title: "Task rescheduled", description: data.message });
            } catch (e: unknown) {
              if (e instanceof TaskSyncAbortedError) return;
              toast({ title: "Error", description: "Failed to reschedule task", variant: "destructive" });
            }
          })();
          break;
        }
        case "show_results": {
          const query = data.payload.query as string;
          if (query) {
            setVoiceSearchQuery(query);
            onNavigateRef.current?.("/tasks");
          }
          break;
        }
        case "show_review": {
          const rawActions = data.payload.actions;
          const rawUnmatched = data.payload.unmatched;
          const reviewActions = Array.isArray(rawActions)
            ? rawActions.filter(isReviewProposalAction)
            : [];
          const reviewUnmatched = Array.isArray(rawUnmatched)
            ? rawUnmatched.filter((u): u is string => typeof u === "string")
            : [];
          if (reviewActions.length > 0) {
            setReviewProposal({
              actions: reviewActions,
              unmatched: reviewUnmatched,
              message: data.message,
            });
          } else {
            setReviewProposal(null);
            toast({
              title: "No matches found",
              description: data.message,
              variant: "destructive",
            });
          }
          break;
        }
        default:
          break;
      }
    },
    onError: () => {
      toast({ title: "Voice Error", description: "Failed to process your command. Try again.", variant: "destructive" });
    },
  });

  const processMutationRef = useRef(processMutation);
  processMutationRef.current = processMutation;

  const handleVoiceResult = useCallback((transcript: string) => {
    const t = transcript.trim();
    if (!t) return;

    if (pendingSearchDictationRef.current) {
      const lower = t.toLowerCase();
      if (hasNavigationLeadIn(lower) && matchNavigationPath(lower) !== null) {
        pendingSearchDictationRef.current = false;
        processMutationRef.current.mutate(t);
        return;
      }
      pendingSearchDictationRef.current = false;
      setVoiceSearchQuery(t);
      setLastResponse({
        intent: "search",
        action: "show_results",
        payload: { query: t, results: [] },
        message: `Searching for "${t}".`,
      });
      return;
    }

    // Fast local shortcut matching — no server round-trip for common phrases
    const shortcut = matchVoiceShortcut(t);
    if (shortcut) {
      switch (shortcut) {
        case "dashboard":
          onNavigateRef.current?.("/");
          setLastResponse({
            intent: "navigation",
            action: "navigate",
            payload: { path: "/" },
            message: "Opening Dashboard.",
          });
          return;
        case "find_tasks":
          onNavigateRef.current?.("/tasks");
          setTimeout(() => window.dispatchEvent(new Event("axtask-focus-task-search")), 50);
          setLastResponse({
            intent: "search",
            action: "prepare_task_search",
            payload: {},
            message: "Ready to search your tasks.",
          });
          return;
        case "new_task":
          onNavigateRef.current?.("/tasks");
          setTimeout(() => window.dispatchEvent(new Event("axtask-open-new-task")), 50);
          setLastResponse({
            intent: "task_create",
            action: "open_new_task",
            payload: { activity: "" },
            message: "Opening task form.",
          });
          return;
      }
    }

    processMutationRef.current.mutate(t);
  }, []);

  const liveVoicePushRef = useRef<(text: string) => void>(() => {});

  const speech = useSpeechRecognition({
    continuous: false,
    onResult: handleVoiceResult,
    onLiveText: (combined) => liveVoicePushRef.current(combined),
  });

  speechRef.current = speech;

  const {
    suggestions: liveTopicSuggestions,
    loading: liveTopicLoading,
    pushLiveText,
  } = useLiveClassificationStream({
    enabled: isBarOpen && speech.status === "listening",
  });

  useEffect(() => {
    liveVoicePushRef.current = (text: string) => pushLiveText(text, "");
  }, [pushLiveText]);

  const toggleListening = useCallback(() => {
    if (speech.status === "listening") {
      speech.stop();
    } else {
      setLastResponse(null);
      speech.resetTranscript();
      speech.start();
    }
  }, [speech]);

  const openBar = useCallback(() => {
    setIsBarOpen(true);
  }, []);

  const openBarAndToggleListening = useCallback(() => {
    setIsBarOpen(true);
    queueMicrotask(() => {
      toggleListening();
    });
  }, [toggleListening]);

  const closeBar = useCallback(() => {
    pendingSearchDictationRef.current = false;
    setIsBarOpen(false);
    if (speech.status === "listening") {
      speech.stop();
    }
  }, [speech]);

  const toggleBar = useCallback(() => {
    if (isBarOpen) {
      closeBar();
    } else {
      openBar();
    }
  }, [isBarOpen, openBar, closeBar]);

  const clearResponse = useCallback(() => {
    setLastResponse(null);
  }, []);

  const consumeTaskPrefill = useCallback(() => {
    const current = taskPrefill;
    if (current) setTaskPrefill(null);
    return current;
  }, [taskPrefill]);

  const consumeVoiceSearch = useCallback(() => {
    const current = voiceSearchQuery;
    if (current) setVoiceSearchQuery(null);
    return current;
  }, [voiceSearchQuery]);

  const clearReviewProposal = useCallback(() => {
    setReviewProposal(null);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        if (!isBarOpen) {
          setIsBarOpen(true);
          setTimeout(() => {
            if (speech.status !== "listening") {
              setLastResponse(null);
              speech.resetTranscript();
              speech.start();
            }
          }, 100);
        } else {
          if (speech.status === "listening") {
            speech.stop();
          } else {
            setLastResponse(null);
            speech.resetTranscript();
            speech.start();
          }
        }
      }

      if (e.key === "Escape" && isBarOpen) {
        closeBar();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isBarOpen, speech, closeBar]);

  return (
    <VoiceContext.Provider
      value={{
        isSupported: speech.isSupported,
        status: speech.status,
        transcript: speech.transcript,
        interimTranscript: speech.interimTranscript,
        error: speech.error,
        isBarOpen,
        lastResponse,
        isProcessing: processMutation.isPending,
        taskPrefill,
        voiceSearchQuery,
        reviewProposal,
        liveTopicSuggestions,
        liveTopicLoading,
        toggleListening,
        openBar,
        openBarAndToggleListening,
        closeBar,
        toggleBar,
        clearResponse,
        consumeTaskPrefill,
        consumeVoiceSearch,
        clearReviewProposal,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}
