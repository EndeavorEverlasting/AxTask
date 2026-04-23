import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTutorial } from "@/hooks/use-tutorial";
import { useToast } from "@/hooks/use-toast";
import { KBD } from "@/lib/keyboard-shortcuts";

const NEXT_FEATURE_MAP: Record<string, { nextPath: string; nextLabel: string }> = {
  "/tasks": { nextPath: "/planner", nextLabel: "AI Planner" },
  "/planner": { nextPath: "/analytics", nextLabel: "Analytics" },
  "/analytics": { nextPath: "/feedback", nextLabel: "Feedback" },
  "/feedback": { nextPath: "/checklist", nextLabel: "Print Checklist" },
  "/checklist": { nextPath: "/import-export", nextLabel: "Import/Export" },
  "/rewards": { nextPath: "/skill-tree", nextLabel: "Skill Tree" },
};

export function TutorialInteractionGuide() {
  const [location] = useLocation();
  const { isActive, currentStep } = useTutorial();
  const { toast } = useToast();
  const seenRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!isActive) {
      seenRef.current = {};
      return;
    }

    if (location === "/tasks" && currentStep?.id === "task-alarms") {
      const key = "tasks-task-alarms-hint";
      if (seenRef.current[key]) return;
      seenRef.current[key] = true;
      toast({
        title: "Try alarms now",
        description: `Use the button in the tutorial bubble, or press ${KBD.alarmPanel} (${KBD.alarmPanelMac}).`,
      });
      return;
    }

    const next = NEXT_FEATURE_MAP[location];
    if (!next) return;
    if (seenRef.current[location]) return;

    seenRef.current[location] = true;
    toast({
      title: "Tutorial hint",
      description: `Nice progress. Next, open ${next.nextLabel} to continue exploring guided features.`,
    });
  }, [isActive, location, toast, currentStep?.id]);

  return null;
}
