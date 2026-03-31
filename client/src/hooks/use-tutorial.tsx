import { useState, useCallback, useEffect, createContext, useContext } from "react";

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  targetId?: string;
  page?: string;
  position?: "top" | "bottom" | "left" | "right";
  glowClass?: "field-glow-tutorial" | "field-glow-tutorial-success";
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to AxTask",
    description: "Let's walk through the key features. This intelligent task manager uses AI-powered priority scoring, gamification, and voice commands to help you stay organized.",
    position: "bottom",
  },
  {
    id: "dashboard",
    title: "Your Dashboard",
    description: "This is your home base. It shows task statistics, upcoming deadlines, and your overall productivity at a glance.",
    page: "/",
    targetId: "sidebar-link-/",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "planner",
    title: "AI Planner",
    description: "Your intelligent planning assistant. Get daily briefings, top recommended tasks, a weekly load overview, and ask questions about your schedule.",
    page: "/planner",
    targetId: "sidebar-link-/planner",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "task-form",
    title: "Creating a Task",
    description: "Fill in the activity field and the system automatically calculates priority based on urgency, impact, and effort. A yellow glow guides you to key areas.",
    page: "/tasks",
    targetId: "sidebar-link-/tasks",
    position: "right",
    glowClass: "field-glow-tutorial-success",
  },
  {
    id: "calendar",
    title: "Calendar View",
    description: "See all your tasks laid out on a calendar. Click any date to add a task for that day, and drag tasks to reschedule them.",
    page: "/calendar",
    targetId: "sidebar-link-/calendar",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "analytics",
    title: "Analytics & Insights",
    description: "Track your productivity trends, see priority distributions, and monitor completion rates over time with interactive charts.",
    page: "/analytics",
    targetId: "sidebar-link-/analytics",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "rewards",
    title: "Rewards & AxCoins",
    description: "Earn AxCoins by completing tasks and classifying them. Spend coins in the Rewards Shop to unlock badges and perks. Your streak multiplier earns you bonus coins!",
    page: "/rewards",
    targetId: "sidebar-link-/rewards",
    position: "right",
    glowClass: "field-glow-tutorial-success",
  },
  {
    id: "checklist",
    title: "Print Checklist",
    description: "Generate a printable PDF checklist for any day. You can even scan a completed checklist photo to update task statuses automatically!",
    page: "/checklist",
    targetId: "sidebar-link-/checklist",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    description: "Power user tip: press Ctrl+Shift+B to toggle the sidebar, Ctrl+Shift+/ to see all keyboard shortcuts, Ctrl+M for voice commands, and Ctrl+Enter to submit the task form.",
    position: "bottom",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "You can restart this tutorial anytime from the sidebar (Ctrl+T). Enjoy using AxTask to stay on top of your tasks!",
    position: "bottom",
    glowClass: "field-glow-tutorial-success",
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        if (isActive) {
          stopTutorial();
        } else {
          startTutorial();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, startTutorial, stopTutorial]);

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
