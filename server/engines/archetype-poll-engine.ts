/**
 * System-scheduled archetype polls: curated templates (no LLM), same spirit
 * as `dialogue-engine.ts` — pre-moderated copy only.
 */
import {
  createArchetypePollWithOptions,
  hasArchetypePollActiveOrFuture,
} from "../storage";

const POLL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type PollTemplate = {
  authorAvatarKey: string;
  title: string;
  body: string | null;
  options: string[];
};

const POLL_TEMPLATES: PollTemplate[] = [
  {
    authorAvatarKey: "mood",
    title: "When do you do your deepest work?",
    body: "Moodweaver is curious how energy patterns land for different kinds of thinkers.",
    options: ["Early morning", "Midday", "Late evening", "It varies too much to say"],
  },
  {
    authorAvatarKey: "archetype",
    title: "How do you usually pick what to do first?",
    body: "Archon wants to know whether urgency, importance, or mood wins most often.",
    options: ["Whatever feels most urgent", "Whatever scores highest on importance", "Whatever matches my current energy", "I use a fixed rule (e.g. hardest first)"],
  },
  {
    authorAvatarKey: "productivity",
    title: "What breaks your momentum most often?",
    body: "Cadence hears a lot about friction — which one hits you hardest?",
    options: ["Notifications and pings", "Task switching", "Unclear next step", "Low physical energy"],
  },
  {
    authorAvatarKey: "social",
    title: "Do you share goals with other people?",
    body: "Nexus is testing how much community matters for follow-through.",
    options: ["Yes — broadly", "Yes — with a few trusted people", "Rarely", "Almost never"],
  },
  {
    authorAvatarKey: "lazy",
    title: "How do you feel about an unfinished list at the end of the day?",
    body: "Drift thinks strategic incompleteness might be underrated.",
    options: ["Stressed — I want it cleared", "Neutral — tomorrow exists", "Relieved — I aimed high", "Proud — I chose rest on purpose"],
  },
];

function pickTemplate(): PollTemplate {
  return POLL_TEMPLATES[Math.floor(Math.random() * POLL_TEMPLATES.length)]!;
}

/**
 * Ensures at least one poll window extends past `now` (open or future-close).
 * Creates a 7-day poll starting immediately when none exists.
 */
export async function ensureArchetypePollSchedule(now: Date = new Date()): Promise<number> {
  if (await hasArchetypePollActiveOrFuture(now)) return 0;
  const t = pickTemplate();
  const opensAt = now;
  const closesAt = new Date(now.getTime() + POLL_WINDOW_MS);
  await createArchetypePollWithOptions({
    title: t.title,
    body: t.body,
    authorAvatarKey: t.authorAvatarKey,
    opensAt,
    closesAt,
    options: t.options.map((label, i) => ({ label, sortOrder: i })),
  });
  return 1;
}
