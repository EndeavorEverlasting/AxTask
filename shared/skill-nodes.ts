export interface SkillNodeData {
  id: string;
  title: string;
  description: string;
  unlockCondition: string;
  requiredTasks: number;
  iconName: string;
  col: number;
  row: number;
  tier: 1 | 2;
  connections: string[];
}

export const SKILL_NODE_DATA: SkillNodeData[] = [
  {
    id: "discipline-1",
    title: "Discipline I",
    description:
      "The foundation of all productivity. Discipline means showing up consistently, even when motivation is low. Completing your first tasks is the first step.",
    unlockCondition: "Complete 3 tasks",
    requiredTasks: 3,
    iconName: "Star",
    col: 0,
    row: 0,
    tier: 1,
    connections: ["planning-1", "focus-1"],
  },
  {
    id: "planning-1",
    title: "Planning I",
    description:
      "Strategic planning transforms chaotic to-do lists into structured, prioritized workflows. You understand deadlines and importance.",
    unlockCondition: "Complete 10 tasks",
    requiredTasks: 10,
    iconName: "Target",
    col: 1,
    row: 0,
    tier: 1,
    connections: ["systems-1"],
  },
  {
    id: "focus-1",
    title: "Focus I",
    description:
      "Deep focus allows you to work without distraction. You complete tasks efficiently and with higher quality by minimizing context-switching.",
    unlockCondition: "Complete 10 tasks",
    requiredTasks: 10,
    iconName: "Clock",
    col: 0,
    row: 1,
    tier: 1,
    connections: ["systems-1"],
  },
  {
    id: "systems-1",
    title: "Systems Thinking I",
    description:
      "You see the big picture. Systems thinking means designing processes and habits that compound over time, making you increasingly effective.",
    unlockCondition: "Complete 25 tasks",
    requiredTasks: 25,
    iconName: "Zap",
    col: 1,
    row: 1,
    tier: 1,
    connections: ["discipline-2", "planning-2"],
  },
  {
    id: "discipline-2",
    title: "Discipline II",
    description:
      "Elite discipline means maintaining output quality under pressure. You've built routines that stick no matter what — adversity no longer derails you.",
    unlockCondition: "Complete 50 tasks",
    requiredTasks: 50,
    iconName: "Flame",
    col: 0,
    row: 2,
    tier: 2,
    connections: ["focus-2"],
  },
  {
    id: "planning-2",
    title: "Planning II",
    description:
      "Advanced planning means you anticipate blockers before they arrive. Your project maps extend weeks ahead with clear milestones and contingency paths.",
    unlockCondition: "Complete 50 tasks",
    requiredTasks: 50,
    iconName: "BarChart2",
    col: 1,
    row: 2,
    tier: 2,
    connections: ["focus-2"],
  },
  {
    id: "focus-2",
    title: "Focus II",
    description:
      "Mastery-level focus means entering flow states on demand. You batch deep work, protect your peak hours, and finish complex work in record time.",
    unlockCondition: "Complete 75 tasks",
    requiredTasks: 75,
    iconName: "Eye",
    col: 0,
    row: 3,
    tier: 2,
    connections: ["systems-2"],
  },
  {
    id: "systems-2",
    title: "Systems Thinking II",
    description:
      "At this level you engineer self-improving systems. Your workflows adapt, automate, and multiply your output — you build leverage, not just effort.",
    unlockCondition: "Complete 100 tasks",
    requiredTasks: 100,
    iconName: "Cpu",
    col: 1,
    row: 3,
    tier: 2,
    connections: [],
  },
];

export const SKILL_NODE_REQUIRED_TASKS: Record<string, number> = Object.fromEntries(
  SKILL_NODE_DATA.map((n) => [n.id, n.requiredTasks])
);

export const VALID_SKILL_NODE_IDS = new Set(SKILL_NODE_DATA.map((n) => n.id));
