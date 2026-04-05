import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { GuidedTourOverlay } from "@/components/tutorial-shell";
import { buildLoginHelpSteps } from "@/lib/login-help-steps";

const LOGIN_HELP_FOOTER_HINT =
  "Tap Next for each step. Esc, X, or Finish exits. After you sign in, press Ctrl+T for the full app tour. Press Ctrl+Shift+H to open this help again.";

export interface LoginHelpOverlayProps {
  oauthProviderNames: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginHelpOverlay({ oauthProviderNames, isOpen, onOpenChange }: LoginHelpOverlayProps) {
  const steps = useMemo(() => buildLoginHelpSteps({ oauthProviderNames }), [oauthProviderNames]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (isOpen) setIdx(0);
  }, [isOpen]);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const next = useCallback(() => {
    if (idx < steps.length - 1) {
      setIdx((i) => i + 1);
    } else {
      onOpenChange(false);
      setIdx(0);
    }
  }, [idx, steps.length, onOpenChange]);

  const prev = useCallback(() => {
    if (idx > 0) setIdx((i) => i - 1);
  }, [idx]);

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        onOpenChange(!isOpenRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const currentStep = steps[idx] ?? null;

  return (
    <GuidedTourOverlay
      isActive={isOpen}
      currentStep={currentStep}
      currentStepIndex={idx}
      totalSteps={steps.length}
      onNext={next}
      onPrev={prev}
      onClose={close}
      footerHint={LOGIN_HELP_FOOTER_HINT}
      titleId="login-help-step-title"
    />
  );
}
