import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { useTutorial } from "@/hooks/use-tutorial";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { splitSentencesForBubbles, wrapTextToLines } from "@/lib/pretext-layout";
import { cn } from "@/lib/utils";

const PRETEXT_FONT = "14px ui-sans-serif, system-ui, sans-serif";
const BUBBLE_TEXT_MAX_WIDTH = 248;

function tailClassForPosition(pos: "top" | "bottom" | "left" | "right" | undefined): string {
  switch (pos || "right") {
    case "right":
      return "tutorial-bubble-tail--left";
    case "left":
      return "tutorial-bubble-tail--right";
    case "bottom":
      return "tutorial-bubble-tail--top";
    case "top":
      return "tutorial-bubble-tail--bottom";
    default:
      return "tutorial-bubble-tail--left";
  }
}

export function TutorialOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, nextStep, prevStep, stopTutorial } = useTutorial();
  const [, navigate] = useLocation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const stackRef = useRef<HTMLDivElement>(null);

  const findTarget = useCallback(() => {
    if (!currentStep) return null;
    if (currentStep.targetId) {
      return document.getElementById(currentStep.targetId);
    }
    if (currentStep.targetSelector) {
      return document.querySelector(currentStep.targetSelector) as HTMLElement | null;
    }
    return null;
  }, [currentStep]);

  const refreshTargetRect = useCallback(() => {
    const el = findTarget();
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [findTarget]);

  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (currentStep.page) {
      navigate(currentStep.page);
    }

    setFadeIn(false);
    const glowCls = currentStep.glowClass || "field-glow-tutorial";
    const timer = setTimeout(() => {
      refreshTargetRect();
      const el = findTarget();
      if (el) {
        el.classList.add(glowCls);
      }
      setFadeIn(true);
    }, 180);

    return () => {
      clearTimeout(timer);
      const el = findTarget();
      if (el) {
        el.classList.remove(glowCls);
        el.classList.remove("field-glow-tutorial");
        el.classList.remove("field-glow-tutorial-success");
        el.classList.remove("field-glow-success");
        el.classList.remove("field-glow-hint");
        el.classList.remove("field-glow-warning");
      }
    };
  }, [isActive, currentStep, findTarget, navigate, refreshTargetRect]);

  useEffect(() => {
    if (!isActive || !currentStep) return;
    refreshTargetRect();
    window.addEventListener("resize", refreshTargetRect);
    document.addEventListener("scroll", refreshTargetRect, true);
    return () => {
      window.removeEventListener("resize", refreshTargetRect);
      document.removeEventListener("scroll", refreshTargetRect, true);
    };
  }, [isActive, currentStep, refreshTargetRect]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stopTutorial();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, stopTutorial]);

  const thoughtChunks = useMemo(() => {
    if (!currentStep) return [];
    return splitSentencesForBubbles(currentStep.description, 3);
  }, [currentStep]);

  const wrappedThoughts = useMemo(() => {
    return thoughtChunks.map((chunk) => wrapTextToLines(chunk, BUBBLE_TEXT_MAX_WIDTH, PRETEXT_FONT));
  }, [thoughtChunks]);

  const position = currentStep?.position || "right";

  useLayoutEffect(() => {
    if (!isActive || !currentStep) return;
    const el = stackRef.current;
    if (!el) return;

    const place = () => {
      const gap = 16;
      const pad = 12;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const rect = targetRect;
      let top = 0;
      let left = 0;

      if (!rect) {
        top = (window.innerHeight - h) / 2;
        left = (window.innerWidth - w) / 2;
      } else if (position === "right") {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - h / 2;
      } else if (position === "left") {
        left = rect.left - gap - w;
        top = rect.top + rect.height / 2 - h / 2;
      } else if (position === "bottom") {
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - w / 2;
      } else {
        top = rect.top - gap - h;
        left = rect.left + rect.width / 2 - w / 2;
      }

      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      setPopoverPos({ top, left });
    };

    place();
    requestAnimationFrame(place);
  }, [isActive, currentStep, targetRect, position, wrappedThoughts, fadeIn, currentStepIndex]);

  if (!isActive || !currentStep) return null;

  const progress = ((currentStepIndex + 1) / totalSteps) * 100;
  const primaryTail = tailClassForPosition(position);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="absolute inset-0 bg-black/30 pointer-events-none transition-opacity duration-300"
        style={{ opacity: fadeIn ? 1 : 0 }}
        aria-hidden
      />

      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-lg"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)",
            zIndex: 51,
          }}
        />
      )}

      <div
        ref={stackRef}
        className={cn(
          "absolute pointer-events-auto max-w-xs w-[min(20rem,calc(100vw-1.5rem))] transition-all duration-300",
          fadeIn ? "opacity-100 scale-100" : "opacity-0 scale-95",
        )}
        style={{ top: popoverPos.top, left: popoverPos.left, zIndex: 52 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-step-title"
      >
        <div
          className={cn(
            "relative rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 mb-2",
            wrappedThoughts.length > 0 && primaryTail,
          )}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <GraduationCap className="h-5 w-5 text-amber-500 shrink-0" aria-hidden />
              <h3 id="tutorial-step-title" className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-tight">
                {currentStep.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={stopTutorial}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0 rounded-md p-0.5"
              aria-label="Exit tutorial"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {wrappedThoughts.length > 0 && (
            <div className="space-y-2 mb-3">
              {wrappedThoughts[0].map((line, i) => (
                <p key={`t0-${i}`} className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                  {line}
                </p>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Tap <strong className="text-gray-700 dark:text-gray-300">Next</strong> for each step. You can scroll the app while the tutorial is open.{" "}
            <strong>Esc</strong>, <strong>X</strong>, or <strong>Finish</strong> exits. <strong>Ctrl+T</strong> toggles the tutorial later.
          </p>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-3">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {currentStepIndex + 1} / {totalSteps}
            </span>
            <div className="flex gap-2 shrink-0">
              {currentStepIndex > 0 && (
                <Button variant="outline" size="sm" onClick={prevStep} className="h-8 px-3 text-xs">
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={nextStep}
                className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                {currentStepIndex === totalSteps - 1 ? "Finish" : "Next"}
                {currentStepIndex < totalSteps - 1 && <ChevronRight className="h-3 w-3 ml-1" />}
              </Button>
            </div>
          </div>
        </div>

        {wrappedThoughts.slice(1).map((lines, chunkIdx) => (
          <div
            key={`extra-${chunkIdx}`}
            className="relative rounded-2xl border border-amber-200/80 dark:border-amber-700/50 bg-amber-50/90 dark:bg-amber-950/40 px-3 py-2 mb-2 shadow-md"
          >
            {lines.map((line, i) => (
              <p key={`${chunkIdx}-${i}`} className="text-xs text-amber-950 dark:text-amber-100 leading-snug">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
