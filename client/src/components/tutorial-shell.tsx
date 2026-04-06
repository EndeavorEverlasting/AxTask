import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { splitSentencesForBubbles, wrapTextToLines } from "@/lib/pretext-layout";
import { cn } from "@/lib/utils";
import type { TutorialStep } from "@/lib/tutorial-types";

const PRETEXT_FONT = "14px ui-sans-serif, system-ui, sans-serif";
const BUBBLE_TEXT_MAX_WIDTH = 248;

/** Extra glow classes that may still be present from older tutorial steps (not the current `glowCls`). */
const LEGACY_GLOW_CLEANUP = [
  "field-glow-tutorial",
  "field-glow-tutorial-success",
  "field-glow-success",
  "field-glow-hint",
  "field-glow-warning",
] as const;

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

export interface GuidedTourOverlayProps {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  /** When set and step has `page`, invoked so the app can route (post-auth tutorial). Login help omits this. */
  onNavigateToPage?: (path: string) => void;
  /** Shown below the thought bubbles (keyboard shortcuts differ for app vs login). */
  footerHint: string;
  /** `aria-labelledby` target */
  titleId?: string;
}

/**
 * Presentation-only guided tour: spotlight, popover, navigation.
 * Does not import login or auth; parent supplies steps and handlers.
 */
export function GuidedTourOverlay({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  onNavigateToPage,
  footerHint,
  titleId = "tutorial-step-title",
}: GuidedTourOverlayProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const stackRef = useRef<HTMLDivElement>(null);
  const glowTargetElRef = useRef<HTMLElement | null>(null);
  const preTourFocusRef = useRef<HTMLElement | null>(null);
  const tourWasActiveRef = useRef(false);

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

  const glowCls = useMemo(
    () => currentStep?.glowClass ?? "field-glow-tutorial",
    [currentStep?.glowClass],
  );

  useEffect(() => {
    if (isActive && !tourWasActiveRef.current) {
      const ae = document.activeElement;
      if (ae instanceof HTMLElement) {
        preTourFocusRef.current = ae;
      }
    }
    if (!isActive && tourWasActiveRef.current) {
      const prev = preTourFocusRef.current;
      preTourFocusRef.current = null;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          prev.focus();
        }
      }
    }
    tourWasActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (currentStep.page && onNavigateToPage) {
      onNavigateToPage(currentStep.page);
    }

    setFadeIn(false);
    const timer = setTimeout(() => {
      refreshTargetRect();
      const resolved = findTarget();
      glowTargetElRef.current = resolved;
      if (resolved) {
        resolved.classList.add(glowCls);
        for (const c of LEGACY_GLOW_CLEANUP) {
          if (c !== glowCls) resolved.classList.remove(c);
        }
      }
      setFadeIn(true);
    }, 180);

    return () => {
      clearTimeout(timer);
      const el = glowTargetElRef.current;
      glowTargetElRef.current = null;
      if (el) {
        el.classList.remove(glowCls);
        for (const c of LEGACY_GLOW_CLEANUP) {
          if (c !== glowCls) el.classList.remove(c);
        }
      }
    };
  }, [isActive, currentStep, findTarget, onNavigateToPage, refreshTargetRect, glowCls]);

  useEffect(() => {
    if (!isActive || !currentStep || !fadeIn) return;
    const shell = stackRef.current;
    if (!shell) return;

    const focusShell = () => {
      try {
        shell.focus({ preventScroll: true });
      } catch {
        shell.focus();
      }
    };
    focusShell();

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = shell.querySelectorAll<HTMLElement>(focusableSelector);
      const focusable = Array.from(nodes).filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        focusShell();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !shell.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !shell.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isActive, currentStep, fadeIn]);

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
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, onClose]);

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
        tabIndex={-1}
        className={cn(
          "absolute pointer-events-auto max-w-xs w-[min(20rem,calc(100vw-1.5rem))] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 rounded-2xl",
          fadeIn ? "opacity-100 scale-100" : "opacity-0 scale-95",
        )}
        style={{ top: popoverPos.top, left: popoverPos.left, zIndex: 52 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
              <h3 id={titleId} className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-tight">
                {currentStep.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
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

          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{footerHint}</p>

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
                <Button variant="outline" size="sm" onClick={onPrev} className="h-8 px-3 text-xs">
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={onNext}
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
