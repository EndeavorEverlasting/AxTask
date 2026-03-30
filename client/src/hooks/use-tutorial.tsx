import { useState, useCallback, useEffect, createContext, useContext } from "react";

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  targetId?: string;
  page?: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to AxTask",
    description: "Let's walk through the key features. This intelligent task manager uses AI-powered priority scoring to help you stay organized.",
    position: "bottom",
  },
  {
    id: "dashboard",
    title: "Your Dashboard",
    description: "This is your home base. It shows task statistics, upcoming deadlines, and your overall productivity at a glance.",
    page: "/",
    targetId: "sidebar-link-/",
    position: "right",
  },
  {
    id: "task-form",
    title: "Creating a Task",
    description: "Fill in the activity field and the system automatically calculates priority. The blue glow guides you through each field in order.",
    page: "/tasks",
    targetId: "sidebar-link-/tasks",
    position: "right",
  },
  {
    id: "calendar",
    title: "Calendar View",
    description: "See all your tasks laid out on a calendar. Click any date to add a task for that day.",
    page: "/calendar",
    targetId: "sidebar-link-/calendar",
    position: "right",
  },
  {
    id: "analytics",
    title: "Analytics & Insights",
    description: "Track your productivity trends, see priority distributions, and monitor completion rates over time.",
    page: "/analytics",
    targetId: "sidebar-link-/analytics",
    position: "right",
  },
  {
    id: "checklist",
    title: "Print Checklist",
    description: "Generate a printable PDF checklist for any day. You can even scan a completed checklist photo to update task statuses automatically!",
    page: "/checklist",
    targetId: "sidebar-link-/checklist",
    position: "right",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "You can restart this tutorial anytime from the sidebar. Enjoy using AxTask to stay on top of your tasks!",
    position: "bottom",
  },
];

interface TutorialContextValue {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  startTutorial: () => void;
  stopTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  hasCompleted: boolean;
}

const TUTORIAL_COMPLETED_KEY = "axtask_tutorial_completed";

function useTutorialEngine(): TutorialContextValue {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(() => {
    try { return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === "true"; } catch { return false; }
  });

  const startTutorial = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const stopTutorial = useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
    try {
      localStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
      setHasCompleted(true);
    } catch {}
  }, []);

  const nextStep = useCallback(() => {
    if (stepIndex < TUTORIAL_STEPS.length - 1) {
      setStepIndex(i => i + 1);
    } else {
      stopTutorial();
    }
  }, [stepIndex, stopTutorial]);

  const prevStep = useCallback(() => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  }, [stepIndex]);

  return {
    isActive,
    currentStep: isActive ? TUTORIAL_STEPS[stepIndex] : null,
    currentStepIndex: stepIndex,
    totalSteps: TUTORIAL_STEPS.length,
    startTutorial,
    stopTutorial,
    nextStep,
    prevStep,
    hasCompleted,
  };
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const engine = useTutorialEngine();
  return <TutorialContext.Provider value={engine}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within TutorialProvider");
  return ctx;
}

export { TUTORIAL_STEPS };
