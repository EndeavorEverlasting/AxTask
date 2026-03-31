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

interface VoiceContextType {
  isSupported: boolean;
  status: SpeechStatus;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isBarOpen: boolean;
  lastResponse: EngineResponse | null;
  isProcessing: boolean;
  toggleListening: () => void;
  openBar: () => void;
  closeBar: () => void;
  toggleBar: () => void;
  clearResponse: () => void;
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
  onPrefillTask?: (data: { activity: string; date?: string; time?: string }) => void;
}

export function VoiceProvider({ children, onNavigate, onPrefillTask }: VoiceProviderProps) {
  const [isBarOpen, setIsBarOpen] = useState(false);
  const [lastResponse, setLastResponse] = useState<EngineResponse | null>(null);
  const { toast } = useToast();
  const onNavigateRef = useRef(onNavigate);
  const onPrefillTaskRef = useRef(onPrefillTask);
  onNavigateRef.current = onNavigate;
  onPrefillTaskRef.current = onPrefillTask;

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
        case "prefill_task":
          onNavigateRef.current?.("/tasks");
          setTimeout(() => {
            onPrefillTaskRef.current?.(data.payload as { activity: string; date?: string; time?: string });
          }, 300);
          break;
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
        toggleListening,
        openBar,
        closeBar,
        toggleBar,
        clearResponse,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}
