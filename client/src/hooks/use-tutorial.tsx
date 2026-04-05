import { useState, useCallback, useEffect, createContext, useContext } from "react";
import type { TutorialStep } from "@/lib/tutorial-types";

export type { TutorialStep };

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to AxTask",
    description: "Let's walk through the key features. This intelligent task manager uses AI-powered priority scoring, gamification with AxCoins, voice commands, and real-time collaboration to keep you productive.",
    position: "bottom",
  },
  {
    id: "dashboard",
    title: "Your Dashboard",
    description: "Your home base — see task statistics, upcoming deadlines, productivity metrics, and your AxCoin balance all in one view.",
    page: "/",
    targetId: "sidebar-link-/",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "planner",
    title: "AI Planner",
    description: "Your intelligent planning assistant. Get daily briefings, top recommended tasks, a weekly load overview, and ask questions about your schedule using the AI chat.",
    page: "/planner",
    targetId: "sidebar-link-/planner",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "task-form",
    title: "Creating & Editing Tasks",
    description: "Use Quick Task Entry on the dashboard or open Tasks from the sidebar. Priority is auto-calculated from urgency, impact, and effort. Yellow glows highlight empty fields, and the RAG engine suggests deadlines based on your patterns.",
    page: "/",
    targetId: "tutorial-task-form",
    position: "right",
    glowClass: "field-glow-tutorial-success",
  },
  {
    id: "voice-commands",
    title: "Voice Commands",
    description: "Tap the microphone icon or press Ctrl+M to dictate tasks hands-free. Say things like \"urgency 4\" or \"due tomorrow\" and the form fills in automatically. Switch between Activity and Notes targets.",
    page: "/",
    targetId: "tutorial-task-form",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "classification",
    title: "Classification & Compound Interest",
    description: "Every task gets a classification (Crisis, Research, Development, etc.) that earns you AxCoins. When others confirm your classification, you earn 8% compound interest per confirmation — your classifications are investments!",
    page: "/",
    targetId: "tutorial-task-form",
    position: "right",
    glowClass: "field-glow-tutorial-success",
  },
  {
    id: "calendar",
    title: "Calendar View",
    description: "See all your tasks on a calendar. Click any date to add a task for that day, and drag tasks to reschedule them.",
    page: "/calendar",
    targetId: "sidebar-link-/calendar",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "analytics",
    title: "Analytics & Insights",
    description: "Track productivity trends, view priority and classification distributions, and monitor completion rates over time with interactive charts.",
    page: "/analytics",
    targetId: "sidebar-link-/analytics",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "rewards",
    title: "Rewards Shop & AxCoins",
    description: "Earn AxCoins by completing tasks, maintaining streaks, and classifying tasks. Spend coins in the Shop on themes, badges, and titles. Check the Investments tab to see your compound interest earnings grow!",
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
    id: "import-export",
    title: "Import & Export",
    description: "Back up your tasks or migrate data between accounts. Export includes all related records (comments, shares, classifications) and import validates everything before applying changes.",
    page: "/import-export",
    targetId: "sidebar-link-/import-export",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "google-sheets",
    title: "Google Sheets Sync",
    description: "Connect your Google Sheets to sync tasks between AxTask and your spreadsheets for flexible reporting and bulk management.",
    page: "/google-sheets",
    targetId: "sidebar-link-/google-sheets",
    position: "right",
    glowClass: "field-glow-tutorial",
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts & Sidebar",
    description: "Power user tips: Ctrl+Shift+B toggles the sidebar, Ctrl+Shift+/ opens the shortcut reference, Ctrl+M starts voice input, Ctrl+Enter submits the task form, and Ctrl+T restarts this tutorial.",
    position: "bottom",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "You now know every corner of AxTask. Restart this tutorial anytime with Ctrl+T or from the sidebar. Happy tasking!",
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
