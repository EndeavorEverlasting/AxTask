import { useVoice } from "@/hooks/use-voice";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  Mic,
  MicOff,
  X,
  Loader2,
  ArrowRight,
  Navigation,
  ListPlus,
  CalendarDays,
  Brain,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INTENT_ICONS: Record<string, typeof Mic> = {
  navigation: Navigation,
  task_create: ListPlus,
  calendar_command: CalendarDays,
  planner_query: Brain,
  search: Search,
};

const INTENT_COLORS: Record<string, string> = {
  navigation: "text-blue-500",
  task_create: "text-green-500",
  calendar_command: "text-orange-500",
  planner_query: "text-purple-500",
  search: "text-gray-500",
};

export function VoiceCommandBar() {
  const {
    isSupported,
    status,
    transcript,
    interimTranscript,
    isBarOpen,
    lastResponse,
    isProcessing,
    toggleListening,
    closeBar,
    clearResponse,
  } = useVoice();

  const reducedMotion = useReducedMotion();

  const isMobile = useIsMobile();

  if (!isSupported || !isBarOpen || isMobile) return null;

  const IntentIcon = lastResponse ? (INTENT_ICONS[lastResponse.intent] || Mic) : Mic;
  const intentColor = lastResponse ? (INTENT_COLORS[lastResponse.intent] || "text-gray-500") : "";

  return (
    <AnimatePresence>
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={toggleListening}
              className={cn(
                "relative flex items-center justify-center rounded-full w-10 h-10 shrink-0 transition-all duration-300",
                status === "listening"
                  ? "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25"
                  : "bg-gradient-to-br from-purple-500 to-indigo-600 text-white hover:shadow-lg hover:scale-105 active:scale-95"
              )}
            >
              {status === "listening" && (
                <>
                  <span className="absolute inset-0 rounded-full animate-ping bg-red-400/25" />
                  <span className="absolute -inset-1 rounded-full animate-pulse bg-red-400/15" />
                </>
              )}
              {status === "listening" ? (
                <MicOff className="h-4 w-4 relative z-10" />
              ) : (
                <Mic className="h-4 w-4 relative z-10" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              {status === "listening" ? (
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-sm text-red-500 font-medium">Listening...</span>
                </div>
              ) : isProcessing ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processing...
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {lastResponse ? "" : "Press the mic or say a command..."}
                </p>
              )}

              {interimTranscript && (
                <p className="text-sm text-gray-600 dark:text-gray-300 italic animate-pulse truncate">
                  {interimTranscript}
                </p>
              )}

              {transcript && !interimTranscript && status !== "listening" && (
                <p className="text-sm text-gray-700 dark:text-gray-200 truncate">
                  "{transcript}"
                </p>
              )}
            </div>

            <button
              onClick={closeBar}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <AnimatePresence>
            {lastResponse && (
              <motion.div
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <div className="flex items-start gap-2.5">
                    <div className={cn("mt-0.5", intentColor)}>
                      <IntentIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">
                        {lastResponse.message}
                      </p>
                      {lastResponse.action === "show_results" && Array.isArray(lastResponse.payload.results) && (lastResponse.payload.results as unknown[]).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {(lastResponse.payload.results as Array<{ id: string; activity: string; date: string }>).slice(0, 3).map((t) => (
                            <div key={t.id} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                              <ArrowRight className="h-3 w-3" />
                              <span className="truncate">{t.activity}</span>
                              <span className="text-gray-400 shrink-0">({t.date})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                      onClick={clearResponse}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 pb-2 flex items-center justify-between">
            <div className="flex gap-2 text-[10px] text-gray-400 dark:text-gray-500">
              <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Ctrl+M</span>
              <span>toggle mic</span>
              <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Esc</span>
              <span>close</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function VoiceBarTrigger() {
  const { isSupported, toggleBar, status } = useVoice();

  if (!isSupported) return null;

  return (
    <button
      onClick={toggleBar}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
        status === "listening"
          ? "bg-red-500/10 text-red-500 animate-pulse"
          : "text-gray-400 hover:text-purple-500 hover:bg-purple-500/10"
      )}
      title="Voice Commands (Ctrl+M)"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
