import { useVoice } from "@/hooks/use-voice";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const INTENT_ICONS: Record<string, typeof Mic> = {
  navigation: Navigation,
  task_create: ListPlus,
  calendar_command: CalendarDays,
  planner_query: Brain,
  search: Search,
};

const INTENT_LABELS: Record<string, string> = {
  navigation: "Navigating",
  task_create: "Creating task",
  calendar_command: "Calendar",
  planner_query: "AI Planner",
  search: "Searching",
};

const INTENT_COLORS: Record<string, string> = {
  navigation: "from-blue-500 to-blue-600",
  task_create: "from-green-500 to-emerald-600",
  calendar_command: "from-orange-500 to-amber-600",
  planner_query: "from-purple-500 to-violet-600",
  search: "from-gray-500 to-gray-600",
};

function WaveformBars({ active, reduced }: { active: boolean; reduced: boolean }) {
  const bars = 24;
  if (reduced) {
    return (
      <div className="flex items-center justify-center gap-[3px] h-16">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-white/60 transition-all duration-300"
            style={{ height: active ? 20 : 4, opacity: active ? 0.6 : 0.2 }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-white/60"
          animate={
            active
              ? {
                  height: [8, 16 + Math.random() * 40, 8],
                  opacity: [0.4, 0.8, 0.4],
                }
              : { height: 4, opacity: 0.2 }
          }
          transition={
            active
              ? {
                  duration: 0.4 + Math.random() * 0.4,
                  repeat: Infinity,
                  repeatType: "reverse",
                  delay: i * 0.03,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

export function MobileVoiceOverlay() {
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
    openBar,
    clearResponse,
  } = useVoice();

  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const [dragY, setDragY] = useState(0);
  const autoStartedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isBarOpen && isMobile && status === "idle" && !lastResponse && !isProcessing && !autoStartedRef.current) {
      autoStartedRef.current = true;
      clearTimer();
      timerRef.current = setTimeout(() => toggleListening(), 200);
    }
    if (!isBarOpen) {
      autoStartedRef.current = false;
      clearTimer();
    }
    return clearTimer;
  }, [isBarOpen, isMobile, status, lastResponse, isProcessing, toggleListening, clearTimer]);

  useEffect(() => {
    if (isBarOpen && overlayRef.current) {
      const firstFocusable = overlayRef.current.querySelector<HTMLElement>("button");
      firstFocusable?.focus();
    }
    if (!isBarOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isBarOpen]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number } }) => {
      if (info.offset.y > 120) {
        closeBar();
      }
      setDragY(0);
    },
    [closeBar]
  );

  const handleNewCommand = useCallback(() => {
    clearResponse();
    clearTimer();
    timerRef.current = setTimeout(() => toggleListening(), 100);
  }, [clearResponse, clearTimer, toggleListening]);

  if (!isSupported || !isMobile) return null;

  const IntentIcon = lastResponse ? (INTENT_ICONS[lastResponse.intent] || Mic) : Mic;
  const intentLabel = lastResponse ? (INTENT_LABELS[lastResponse.intent] || "Processed") : "";
  const intentGradient = lastResponse ? (INTENT_COLORS[lastResponse.intent] || "from-gray-500 to-gray-600") : "";
  const isListening = status === "listening";

  return (
    <>
      <button
        ref={triggerRef}
        className="md:hidden fixed right-4 bottom-20 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-lg shadow-purple-500/30 flex items-center justify-center active:scale-95 transition-transform"
        onClick={openBar}
        aria-label="Open voice commands"
      >
        <Mic className="h-6 w-6" />
      </button>

      <AnimatePresence>
        {isBarOpen && (
          <motion.div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Voice commands"
            initial={reducedMotion ? false : { opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={reducedMotion ? { duration: 0.1 } : { type: "spring", damping: 28, stiffness: 300 }}
            drag={reducedMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDrag={(_, info) => setDragY(info.offset.y)}
            onDragEnd={handleDragEnd}
            className="fixed inset-0 z-[60] md:hidden flex flex-col"
            style={{
              background: `linear-gradient(180deg, #0f0a1e 0%, #1a1035 40%, #0d0d2b 100%)`,
              opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 400) : 1,
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-purple-500" />
                <span className="text-white/70 text-sm font-medium tracking-wide">AxTask Voice</span>
              </div>
              <button
                onClick={closeBar}
                aria-label="Close voice commands"
                className="p-2 rounded-full text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!reducedMotion && (
              <div className="flex items-center justify-center py-1">
                <ChevronDown className="h-4 w-4 text-white/20" />
              </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
              {!lastResponse && (
                <>
                  <WaveformBars active={isListening} reduced={reducedMotion} />

                  <motion.button
                    onClick={toggleListening}
                    aria-label={isListening ? "Stop listening" : "Start listening"}
                    className={cn(
                      "relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300",
                      isListening
                        ? "bg-gradient-to-br from-red-500 to-rose-600 shadow-2xl shadow-red-500/40"
                        : "bg-gradient-to-br from-purple-500 to-indigo-600 shadow-2xl shadow-purple-500/30"
                    )}
                    whileTap={reducedMotion ? undefined : { scale: 0.92 }}
                  >
                    {isListening && !reducedMotion && (
                      <>
                        <motion.span
                          className="absolute inset-0 rounded-full bg-red-400/20"
                          animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <motion.span
                          className="absolute inset-0 rounded-full bg-red-400/15"
                          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                        />
                      </>
                    )}
                    {isListening ? (
                      <MicOff className="h-10 w-10 text-white relative z-10" />
                    ) : (
                      <Mic className="h-10 w-10 text-white relative z-10" />
                    )}
                  </motion.button>

                  <div className="text-center min-h-[80px] flex flex-col items-center justify-center">
                    {isListening ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="relative flex h-2.5 w-2.5">
                            {!reducedMotion && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />}
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                          </span>
                          <span className="text-red-400 text-sm font-medium">Listening...</span>
                        </div>
                        {interimTranscript && (
                          <p className="text-white/80 text-lg font-light italic max-w-[300px]">
                            {interimTranscript}
                          </p>
                        )}
                        {transcript && !interimTranscript && (
                          <p className="text-white/90 text-lg font-light max-w-[300px]">
                            "{transcript}"
                          </p>
                        )}
                      </>
                    ) : isProcessing ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                        <p className="text-white/60 text-sm">Processing your command...</p>
                        {transcript && (
                          <p className="text-white/40 text-sm italic max-w-[280px]">
                            "{transcript}"
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-white/40 text-base mb-1">Tap the mic and speak</p>
                        <p className="text-white/25 text-xs">
                          Create tasks, navigate, search, or ask the AI planner
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {lastResponse && (
                <motion.div
                  initial={reducedMotion ? false : { scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full max-w-sm"
                >
                  <div className={cn("rounded-2xl p-5 bg-gradient-to-br shadow-xl", intentGradient)}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <IntentIcon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-white/70 text-xs font-medium uppercase tracking-wider">{intentLabel}</p>
                        <p className="text-white text-sm font-medium">{transcript}</p>
                      </div>
                    </div>
                    <p className="text-white/90 text-base leading-relaxed whitespace-pre-line">
                      {lastResponse.message}
                    </p>

                    {lastResponse.action === "show_results" && Array.isArray(lastResponse.payload.results) && (lastResponse.payload.results as unknown[]).length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-white/20 pt-3">
                        {(lastResponse.payload.results as Array<{ id: string; activity: string; date: string }>).slice(0, 5).map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-white/70 text-sm">
                            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t.activity}</span>
                            <span className="text-white/40 text-xs shrink-0">({t.date})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleNewCommand}
                      className="flex-1 py-3 rounded-xl bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors"
                    >
                      New command
                    </button>
                    <button
                      onClick={closeBar}
                      className="flex-1 py-3 rounded-xl bg-white/10 text-white/80 text-sm font-medium hover:bg-white/15 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="px-6 pb-8 pt-4">
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "Create a task",
                  "Go to calendar",
                  "Search meetings",
                  "What's my plan?",
                ].map((hint) => (
                  <span
                    key={hint}
                    className="px-3 py-1.5 rounded-full bg-white/5 text-white/30 text-xs border border-white/10"
                  >
                    "{hint}"
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
