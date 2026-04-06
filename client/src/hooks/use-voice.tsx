import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useSpeechRecognition, type SpeechStatus } from "./use-speech-recognition";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Task } from "@shared/schema";
import { syncUpdateTask, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";

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
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

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
        case "prefill_task": {
          const prefill: TaskPrefill = {
            activity: (data.payload.activity as string) || "",
            date: data.payload.date as string | undefined,
            time: data.payload.time as string | undefined,
          };
          setTaskPrefill(prefill);
          onNavigateRef.current?.("/");
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

  const handleVoiceResult = useCallback((transcript: string) => {
    if (transcript.trim()) {
      processMutation.mutate(transcript.trim());
    }
  }, [processMutation]);

  const speech = useSpeechRecognition({
    continuous: false,
    onResult: handleVoiceResult,
  });

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
