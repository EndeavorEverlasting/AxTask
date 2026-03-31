import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useSpeechRecognition, type SpeechStatus } from "./use-speech-recognition";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  toggleListening: () => void;
  openBar: () => void;
  closeBar: () => void;
  toggleBar: () => void;
  clearResponse: () => void;
  consumeTaskPrefill: () => TaskPrefill | null;
  consumeVoiceSearch: () => string | null;
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
          apiRequest("PUT", `/api/tasks/${taskId}`, { id: taskId, date: newDate })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              queryClient.invalidateQueries({ queryKey: ["/api/planner/briefing"] });
              toast({ title: "Task rescheduled", description: data.message });
            })
            .catch(() => {
              toast({ title: "Error", description: "Failed to reschedule task", variant: "destructive" });
            });
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        const target = e.target as HTMLElement;
        const isFormField = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
        if (isFormField) return;

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
        toggleListening,
        openBar,
        closeBar,
        toggleBar,
        clearResponse,
        consumeTaskPrefill,
        consumeVoiceSearch,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}
