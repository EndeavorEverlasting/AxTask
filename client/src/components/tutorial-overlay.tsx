import { useEffect, useState, useCallback } from "react";
import { useTutorial } from "@/hooks/use-tutorial";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";

export function TutorialOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, nextStep, prevStep, stopTutorial } = useTutorial();
  const [, navigate] = useLocation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [fadeIn, setFadeIn] = useState(false);

  const findTarget = useCallback(() => {
    if (!currentStep) return null;
    if (currentStep.targetId) {
      return document.getElementById(currentStep.targetId);
    }
    if (currentStep.targetSelector) {
      return document.querySelector(currentStep.targetSelector);
    }
    return null;
  }, [currentStep]);

  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (currentStep.page) {
      navigate(currentStep.page);
    }

    setFadeIn(false);
    const glowCls = currentStep.glowClass || "field-glow-tutorial";
    const timer = setTimeout(() => {
      const el = findTarget();
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        el.classList.add(glowCls);
      } else {
        setTargetRect(null);
      }
      setFadeIn(true);
    }, 150);

    return () => {
      clearTimeout(timer);
      const el = findTarget();
      if (el) {
        el.classList.remove("field-glow-tutorial");
        el.classList.remove("field-glow-tutorial-success");
      }
    };
  }, [isActive, currentStep, findTarget, navigate]);

  if (!isActive || !currentStep) return null;

  const progress = ((currentStepIndex + 1) / totalSteps) * 100;

  const tooltipStyle: React.CSSProperties = {};
  if (targetRect) {
    const pos = currentStep.position || "right";
    const gap = 16;
    if (pos === "right") {
      tooltipStyle.top = targetRect.top + targetRect.height / 2;
      tooltipStyle.left = targetRect.right + gap;
      tooltipStyle.transform = "translateY(-50%)";
    } else if (pos === "left") {
      tooltipStyle.top = targetRect.top + targetRect.height / 2;
      tooltipStyle.right = window.innerWidth - targetRect.left + gap;
      tooltipStyle.transform = "translateY(-50%)";
    } else if (pos === "bottom") {
      tooltipStyle.top = targetRect.bottom + gap;
      tooltipStyle.left = targetRect.left + targetRect.width / 2;
      tooltipStyle.transform = "translateX(-50%)";
    } else {
      tooltipStyle.bottom = window.innerHeight - targetRect.top + gap;
      tooltipStyle.left = targetRect.left + targetRect.width / 2;
      tooltipStyle.transform = "translateX(-50%)";
    }
  } else {
    tooltipStyle.top = "50%";
    tooltipStyle.left = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto transition-opacity duration-300"
        style={{ opacity: fadeIn ? 1 : 0 }}
        onClick={stopTutorial}
      />

      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-lg"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.15)",
            zIndex: 51,
          }}
        />
      )}

      <div
        className={`absolute pointer-events-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 p-5 max-w-sm w-80 transition-all duration-300 ${fadeIn ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        style={{ ...tooltipStyle, zIndex: 52 }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{currentStep.title}</h3>
          </div>
          <button
            onClick={stopTutorial}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
          {currentStep.description}
        </p>

        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-3">
          <div
            className="bg-yellow-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{currentStepIndex + 1} / {totalSteps}</span>
          <div className="flex gap-2">
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
    </div>
  );
}
