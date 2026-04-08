import { useCallback } from "react";
import { useTutorial } from "@/hooks/use-tutorial";
import { useLocation } from "wouter";
import { GuidedTourOverlay } from "@/components/tutorial-shell";
import { KBD, SHORTCUT_FOCUS_NOTE } from "@/lib/keyboard-shortcuts";

const APP_TUTORIAL_FOOTER_HINT =
  `Tap Next for each step. You can scroll the app while the tutorial is open. Esc, X, or Finish exits. ${KBD.tutorialToggle} (${KBD.tutorialToggleMac} on Mac) toggles this tutorial after you sign in. ${SHORTCUT_FOCUS_NOTE}`;

export function TutorialOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, nextStep, prevStep, stopTutorial } = useTutorial();
  const [, navigate] = useLocation();

  const onNavigateToPage = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  return (
    <GuidedTourOverlay
      isActive={isActive}
      currentStep={currentStep}
      currentStepIndex={currentStepIndex}
      totalSteps={totalSteps}
      onNext={nextStep}
      onPrev={prevStep}
      onClose={stopTutorial}
      onNavigateToPage={onNavigateToPage}
      footerHint={APP_TUTORIAL_FOOTER_HINT}
    />
  );
}
