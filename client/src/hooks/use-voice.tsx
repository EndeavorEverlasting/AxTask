import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useWakeWordSpeech } from "@/hooks/use-wake-speech";
import { useSpeechRecognition, type SpeechStatus } from "./use-speech-recognition";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserVoicePreference, VoiceListeningMode } from "@shared/schema";
import type { Task } from "@shared/schema";
import { hasNavigationLeadIn, matchNavigationPath } from "@shared/voice-dispatch";
import { syncCreateTask, syncUpdateTask, TaskSyncAbortedError } from "@/lib/task-sync-api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { InsertTask } from "@shared/schema";
import { useLiveClassificationStream, type LiveClassificationSuggestion } from "./use-live-classification-stream";
import { TUTORIAL_STEPS, useTutorial } from "@/hooks/use-tutorial";
import { matchVoiceShortcut } from "@/lib/voice-shortcuts";
import { matchVoiceMicChord, voiceBarOpenRef } from "@/lib/hotkey-actions";

/** Parse stored alarm snapshot JSON for the alarm panel; returns null if malformed. */
function parseAlarmPanelDetailFromSnapshot(payloadJson: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.taskId !== "string" && typeof o.taskActivity !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

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
  /** Server-synced preference: background wake-style listening after first mic use, or manual-only. */
  voiceListeningMode: VoiceListeningMode;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}

/** For components that may render outside `VoiceProvider` (e.g. isolated tests). */
export function useVoiceOptional(): VoiceContextType | null {
  return useContext(VoiceContext);
}

interface VoiceProviderProps {
  children: ReactNode;
  onNavigate?: (path: string) => void;
}

export function VoiceProvider({ children, onNavigate }: VoiceProviderProps) {
  const { user } = useAuth();
  const { data: voicePrefData, isError: voicePrefQueryError } = useQuery<UserVoicePreference>({
    queryKey: ["/api/voice/preferences"],
    enabled: Boolean(user?.id),
  });
  const voiceListeningMode: VoiceListeningMode =
    voicePrefData?.listeningMode === "manual" ? "manual" : "wake_after_first_use";
  /**
   * Avoid treating users as wake mode before GET returns (manual pref must not briefly enable the listener).
   * On fetch error, fall through so wake_after_first_use users are not stuck with wake disabled forever.
   */
  const voicePrefsHydrated = !user?.id || voicePrefData !== undefined || voicePrefQueryError;

  const [isBarOpen, setIsBarOpen] = useState(false);
  const [wakeSessionEnabled, setWakeSessionEnabled] = useState(false);
  const [lastResponse, setLastResponse] = useState<EngineResponse | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState<string | null>(null);
  const [reviewProposal, setReviewProposal] = useState<ReviewProposal | null>(null);
  const { toast } = useToast();
  const { startTutorial, stopTutorial, isActive: isTutorialActive, jumpToStepById } = useTutorial();
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
        case "create_shopping_tasks": {
          const items = data.payload.items as string[];
          const date = (data.payload.date as string) || new Date().toISOString().split("T")[0];
          const time = typeof data.payload.time === "string" ? data.payload.time : "";
          const uid = user?.id ?? "";
          if (!items?.length) break;
          if (!uid) {
            toast({
              title: "Sign in required",
              description: "Log in to add items to your shopping list.",
              variant: "destructive",
            });
            break;
          }
          void (async () => {
            try {
              for (const activity of items) {
                const body: InsertTask = {
                  date,
                  time: time || undefined,
                  activity,
                  notes: "",
                  recurrence: "none",
                  status: "pending",
                  visibility: "private",
                  communityShowNotes: false,
                };
                await syncCreateTask(body, queryClient, uid);
              }
              await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
              await queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
              await queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
              onNavigateRef.current?.("/shopping");
              toast({
                title: "Shopping list updated",
                description:
                  items.length === 1
                    ? `Added “${items[0]}”.`
                    : `Added ${items.length} items.`,
              });
            } catch (e: unknown) {
              if (e instanceof TaskSyncAbortedError) return;
              toast({
                title: "Could not add items",
                description: e instanceof Error ? e.message : "Try again.",
                variant: "destructive",
              });
            }
          })();
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
          /* Same event as Alt+F / sidebar — `task-list.tsx` is gone; TaskListHost
           * listens for `axtask-focus-task-search` only. Delay matches other
           * navigate-then-focus paths so /tasks can mount first. */
          window.setTimeout(
            () => window.dispatchEvent(new Event("axtask-focus-task-search")),
            100,
          );
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
        case "alarm_open_panel": {
          window.dispatchEvent(new Event("axtask-open-alarm-panel"));
          break;
        }
        case "alarm_create_for_task": {
          window.dispatchEvent(new CustomEvent("axtask-open-alarm-panel", {
            detail: {
              taskId: data.payload.taskId,
              taskActivity: data.payload.taskActivity,
              alarmDate: data.payload.alarmDate,
              alarmTime: data.payload.alarmTime,
            },
          }));
          break;
        }
        case "alarm_list": {
          void (async () => {
            try {
              const res = await apiRequest("GET", "/api/alarm-snapshots");
              const body = await res.json() as { snapshots?: Array<{ label?: string; capturedAt?: string }> };
              const first = body.snapshots?.[0];
              toast({
                title: "Alarm snapshots",
                description: first?.label
                  ? `Latest: ${first.label}`
                  : "No alarm snapshots saved yet.",
              });
            } catch (e: unknown) {
              toast({
                title: "Could not load alarms",
                description: e instanceof Error ? e.message : "Try again.",
                variant: "destructive",
              });
            }
          })();
          break;
        }
        case "alarm_load": {
          void (async () => {
            try {
              const listRes = await apiRequest("GET", "/api/alarm-snapshots");
              const listBody = await listRes.json() as { snapshots?: Array<{ id: string }> };
              const latest = listBody.snapshots?.[0];
              if (!latest) {
                toast({ title: "No snapshots", description: "Save an alarm snapshot first." });
                return;
              }
              const payloadRes = await apiRequest("GET", `/api/alarm-snapshots/${latest.id}/payload`);
              const payloadBody = await payloadRes.json() as { payloadJson?: string };
              if (!payloadBody.payloadJson) {
                toast({ title: "Snapshot empty", description: "Selected snapshot did not include payload." });
                return;
              }
              const detail = parseAlarmPanelDetailFromSnapshot(payloadBody.payloadJson);
              if (!detail) {
                toast({
                  title: "Invalid snapshot",
                  description: "This alarm snapshot is not in the expected format.",
                  variant: "destructive",
                });
                return;
              }
              window.dispatchEvent(new CustomEvent("axtask-open-alarm-panel", { detail }));
            } catch (e: unknown) {
              toast({
                title: "Could not load snapshot",
                description: e instanceof Error ? e.message : "Try again.",
                variant: "destructive",
              });
            }
          })();
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

  const handleVoiceResultRef = useRef<(transcript: string) => void>(() => {});

  const liveVoicePushRef = useRef<(text: string) => void>(() => {});

  const speech = useSpeechRecognition({
    continuous: false,
    onResult: (transcript) => handleVoiceResultRef.current(transcript),
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

  const handleVoiceResult = useCallback(
    (transcript: string) => {
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
          case "shopping_list":
            onNavigateRef.current?.("/shopping");
            setLastResponse({
              intent: "navigation",
              action: "navigate",
              payload: { path: "/shopping" },
              message: "Opening your shopping list.",
            });
            return;
          case "calendar":
            onNavigateRef.current?.("/calendar");
            setLastResponse({
              intent: "navigation",
              action: "navigate",
              payload: { path: "/calendar" },
              message: "Opening Calendar.",
            });
            return;
          case "find_tasks":
            onNavigateRef.current?.("/tasks");
            setTimeout(() => window.dispatchEvent(new Event("axtask-focus-task-search")), 100);
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
          case "open_global_search":
            window.dispatchEvent(new Event("axtask-open-global-search"));
            setLastResponse({
              intent: "search",
              action: "global_search_open",
              payload: {},
              message: "Opening global search.",
            });
            return;
          case "open_alarm_panel":
            window.dispatchEvent(new Event("axtask-open-alarm-panel"));
            setLastResponse({
              intent: "alarm_config",
              action: "alarm_open_panel",
              payload: {},
              message: "Opening alarm panel.",
            });
            return;
          case "list_alarms":
            void (async () => {
              try {
                const res = await apiRequest("GET", "/api/alarm-snapshots");
                const body = await res.json() as { snapshots?: Array<{ label?: string }> };
                const first = body.snapshots?.[0];
                toast({
                  title: "Alarm snapshots",
                  description: first?.label ? `Latest: ${first.label}` : "No alarm snapshots saved yet.",
                });
              } catch (e: unknown) {
                toast({
                  title: "Could not load alarms",
                  description: e instanceof Error ? e.message : "Try again.",
                  variant: "destructive",
                });
              }
            })();
            setLastResponse({
              intent: "alarm_config",
              action: "alarm_list",
              payload: {},
              message: "Listed saved alarms.",
            });
            return;
          case "toggle_tutorial":
            if (isTutorialActive) stopTutorial();
            else startTutorial();
            setLastResponse({
              intent: "tutorial",
              action: "tutorial_toggle",
              payload: {},
              message: "Tutorial toggled.",
            });
            return;
          case "toggle_hotkey_help":
            window.dispatchEvent(new Event("axtask-toggle-hotkey-help"));
            setLastResponse({
              intent: "help",
              action: "hotkey_help",
              payload: {},
              message: "Keyboard shortcuts.",
            });
            return;
          case "toggle_sidebar":
            window.dispatchEvent(new Event("axtask-toggle-sidebar"));
            setLastResponse({
              intent: "layout",
              action: "sidebar_toggle",
              payload: {},
              message: "Toggling sidebar.",
            });
            return;
          case "toggle_login_help":
            window.dispatchEvent(new Event("axtask-toggle-login-help"));
            setLastResponse({
              intent: "help",
              action: "login_help",
              payload: {},
              message: "Login help.",
            });
            return;
          case "wake_open_voice":
            openBarAndToggleListening();
            setLastResponse({
              intent: "voice",
              action: "wake",
              payload: {},
              message: "Listening.",
            });
            return;
          default:
            break;
        }
      }

      processMutationRef.current.mutate(t);
    },
    [isTutorialActive, startTutorial, stopTutorial, openBarAndToggleListening, toast],
  );

  useEffect(() => {
    handleVoiceResultRef.current = handleVoiceResult;
  }, [handleVoiceResult]);

  useEffect(() => {
    if (speech.status === "listening") {
      setWakeSessionEnabled(true);
    }
  }, [speech.status]);

  useWakeWordSpeech({
    enabled: voicePrefsHydrated && voiceListeningMode === "wake_after_first_use" && wakeSessionEnabled,
    paused: speech.status === "listening" || processMutation.isPending,
    onWakeTranscript: (raw) => handleVoiceResultRef.current(raw),
  });

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

  voiceBarOpenRef.current = isBarOpen;

  useEffect(() => {
    return () => {
      voiceBarOpenRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onCloseVoiceBar = () => {
      closeBar();
    };
    window.addEventListener("axtask-close-voice-bar", onCloseVoiceBar);
    return () => window.removeEventListener("axtask-close-voice-bar", onCloseVoiceBar);
  }, [closeBar]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!matchVoiceMicChord(e)) return;
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
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isBarOpen, speech]);

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
        voiceListeningMode,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}
