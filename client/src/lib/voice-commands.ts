import { addDays, format } from "date-fns";

export interface VoiceCommand {
  type: "priority" | "urgency" | "impact" | "effort" | "status" | "date" | "tag";
  value: string | number;
  original: string;
}

const priorityPatterns = [
  { pattern: /\b(?:priority|set priority|make it)\s+(?:to\s+)?(?:very\s+)?high(?:est)?\b/i, value: "high" },
  { pattern: /\b(?:priority|set priority|make it)\s+(?:to\s+)?critical\b/i, value: "critical" },
  { pattern: /\b(?:priority|set priority|make it)\s+(?:to\s+)?medium\b/i, value: "medium" },
  { pattern: /\b(?:priority|set priority|make it)\s+(?:to\s+)?low\b/i, value: "low" },
  { pattern: /\bhigh(?:est)?\s+priority\b/i, value: "high" },
  { pattern: /\blow\s+priority\b/i, value: "low" },
  { pattern: /\bmedium\s+priority\b/i, value: "medium" },
  { pattern: /\bcritical\s+priority\b/i, value: "critical" },
];

const urgencyPatterns = [
  { pattern: /\burgency\s+(\d)\b/i, extract: true },
  { pattern: /\bset urgency\s+(?:to\s+)?(\d)\b/i, extract: true },
  { pattern: /\bnot\s+urgent\b/i, value: 1 },
  { pattern: /\bvery\s+urgent\b/i, value: 5 },
  { pattern: /\burgent\b/i, value: 4 },
];

const statusPatterns = [
  { pattern: /\b(?:mark|set)\s+(?:as\s+|it\s+)?complete(?:d)?\b/i, value: "completed" },
  { pattern: /\b(?:mark|set)\s+(?:as\s+|it\s+)?in\s*progress\b/i, value: "in-progress" },
  { pattern: /\b(?:mark|set)\s+(?:as\s+|it\s+)?pending\b/i, value: "pending" },
  { pattern: /\bdone\b/i, value: "completed" },
  { pattern: /\bin\s+progress\b/i, value: "in-progress" },
];

const datePatterns = [
  { pattern: /\bdue\s+today\b/i, days: 0 },
  { pattern: /\bdue\s+tomorrow\b/i, days: 1 },
  { pattern: /\bdue\s+(?:in\s+)?(\d+)\s+days?\b/i, daysExtract: true },
  { pattern: /\bdue\s+next\s+week\b/i, days: 7 },
  { pattern: /\bset\s+date\s+(?:to\s+)?today\b/i, days: 0 },
  { pattern: /\bset\s+date\s+(?:to\s+)?tomorrow\b/i, days: 1 },
];

const tagPattern = /\btag\s+(?:it\s+)?(?:as\s+|with\s+)?["']?([a-z0-9\s]+?)["']?\s*$/i;

export function parseVoiceCommands(text: string): VoiceCommand[] {
  const commands: VoiceCommand[] = [];
  const lower = text.toLowerCase().trim();

  for (const p of priorityPatterns) {
    if (p.pattern.test(lower)) {
      const urgencyVal = p.value === "critical" ? 5 : p.value === "high" ? 4 : p.value === "medium" ? 3 : 1;
      commands.push({ type: "urgency", value: urgencyVal, original: text });
      break;
    }
  }

  for (const p of urgencyPatterns) {
    const match = lower.match(p.pattern);
    if (match) {
      const val = (p as any).extract ? parseInt(match[1]) : (p as any).value;
      if (val >= 1 && val <= 5) {
        commands.push({ type: "urgency", value: val, original: text });
      }
      break;
    }
  }

  for (const p of statusPatterns) {
    if (p.pattern.test(lower)) {
      commands.push({ type: "status", value: p.value!, original: text });
      break;
    }
  }

  for (const p of datePatterns) {
    const match = lower.match(p.pattern);
    if (match) {
      const days = (p as any).daysExtract ? parseInt(match[1]) : (p as any).days;
      const targetDate = addDays(new Date(), days);
      commands.push({ type: "date", value: format(targetDate, "yyyy-MM-dd"), original: text });
      break;
    }
  }

  const tagMatch = lower.match(tagPattern);
  if (tagMatch) {
    commands.push({ type: "tag", value: `#${tagMatch[1].trim()}`, original: text });
  }

  return commands;
}

export function stripCommandText(text: string): string {
  let cleaned = text;

  const commandPatterns = [
    /\b(?:priority|set priority|make it)\s+(?:to\s+)?(?:very\s+)?(?:high(?:est)?|critical|medium|low)\b/gi,
    /\b(?:high(?:est)?|low|medium|critical)\s+priority\b/gi,
    /\burgency\s+\d\b/gi,
    /\bset urgency\s+(?:to\s+)?\d\b/gi,
    /\bnot\s+urgent\b/gi,
    /\b(?:very\s+)?urgent\b/gi,
    /\b(?:mark|set)\s+(?:as\s+|it\s+)?(?:complete(?:d)?|in\s*progress|pending|done)\b/gi,
    /\bdue\s+(?:today|tomorrow|(?:in\s+)?\d+\s+days?|next\s+week)\b/gi,
    /\bset\s+date\s+(?:to\s+)?(?:today|tomorrow)\b/gi,
    /\btag\s+(?:it\s+)?(?:as\s+|with\s+)?["']?[a-z0-9\s]+?["']?\s*$/gi,
  ];

  for (const p of commandPatterns) {
    cleaned = cleaned.replace(p, "");
  }

  return cleaned.replace(/\s{2,}/g, " ").trim();
}
