import { LlmProviderConfigError, type LlmProvider } from "../contracts/llm-provider";
import { OpenAiProvider } from "../providers/openai-provider";
import { buildClarificationIntent, type AiIntentResult } from "../schemas/intent-result";

const OFFSET_WORD_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};

/** Matches phrases that should use LLM / future recurring-task intent, not quick create_task. */
const RECURRENCE_OR_SCHEDULE_HINT =
  /\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bweekly\b|\bmonthly\b|\bdaily\b|\bevery\s+week\b|\bevery\s+month\b|\bevery\s+(?:morning|afternoon|evening|night)\b|\bat\s+\d{1,2}\b|\d{1,2}:\d{2}/i;

function parseOffsetMinutes(input: string): number | null {
  const digitMatch = input.match(/\b(\d{1,4})\s*(minute|min)\b/i);
  if (digitMatch) {
    const value = Number.parseInt(digitMatch[1], 10);
    if (Number.isFinite(value) && value >= 1 && value <= 1440) return value;
  }
  const wordMatch = input.match(/\b(one|two|three|four|five|ten|fifteen|twenty|thirty)\s+minutes?\b/i);
  if (!wordMatch) return null;
  return OFFSET_WORD_MAP[wordMatch[1].toLowerCase()] ?? null;
}

function extractLocationReminderTitle(text: string): string {
  let t = text.trim();
  t = t.replace(/^set a reminder to\s*/i, "");
  t = t.replace(/^remind me (?:to )?/i, "");
  t = t.replace(/^reminder:\s*/i, "");
  t = t.trim();
  const onlyLocationBoilerplate =
    /^(when i get (home|to home)|when i get to work|when i arrive at work|when i get (back )?from work|after i get (home|to home)|after i get (to )?work)[.!?\s]*$/i;
  if (!t || onlyLocationBoilerplate.test(t)) return "Reminder";
  return t || "Reminder";
}

function parseQuickIntent(message: string): AiIntentResult | null {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (/\bevery now and again\b|\bsometime\b|\boften\b/.test(lower)) {
    return buildClarificationIntent(
      "How often should I remind you (for example: daily, weekly, or specific days)?",
      "The recurrence phrase is ambiguous.",
      ["recurrence"],
    );
  }

  if (!RECURRENCE_OR_SCHEDULE_HINT.test(lower)) {
    const taskMatch = lower.match(/\b(?:make|create)\s+(?:a\s+)?task\s+to\s+(.+)/);
    if (taskMatch) {
      const activity = taskMatch[1].trim().replace(/[.!?]+$/g, "").trim();
      if (activity.length >= 1 && activity.length <= 500) {
        return {
          type: "create_task",
          payload: {
            activity,
            notes: null,
          },
        };
      }
    }
  }

  const afterHome = /\bafter i get (home|to home)\b/.test(lower);
  const afterWork = /\bafter i get (to )?work\b/.test(lower);
  const whenHome = /\bwhen i get (home|to home)\b/.test(lower);
  const whenWork = /\bwhen i get to work\b|\bwhen i arrive at work\b|\bwhen i get (to )?work\b/.test(lower);

  const mentionsHome = afterHome || whenHome;
  const mentionsWork = afterWork || whenWork;

  if (mentionsHome && mentionsWork) {
    return null;
  }

  if (mentionsHome || mentionsWork) {
    const placeSlug = mentionsWork ? "work" : "home";
    const explicitOffset = parseOffsetMinutes(lower);
    const daily = /\bevery day\b|\bdaily\b/.test(lower);

    if (daily && explicitOffset == null) {
      return buildClarificationIntent(
        "Say how many minutes after you arrive (for example: five minutes after I get home every day), or pick a specific clock time for a daily reminder.",
        "Daily location reminders need an explicit minute offset or a time-of-day schedule.",
        ["time", "offset"],
      );
    }

    const title = extractLocationReminderTitle(text);

    if (explicitOffset != null) {
      return {
        type: "create_reminder",
        payload: {
          kind: "location_offset",
          title,
          body: null,
          enabled: true,
          trigger: {
            type: "location_arrival_offset",
            placeSlug,
            offsetMinutes: explicitOffset,
            recurrence: daily
              ? {
                  frequency: "daily",
                  interval: 1,
                }
              : undefined,
          },
        },
      };
    }

    return {
      type: "create_reminder",
      payload: {
        kind: "location_event",
        title,
        body: null,
        enabled: true,
        trigger: {
          type: "location_arrival",
          placeSlug,
        },
      },
    };
  }

  if (/\bevery day\b|\bdaily\b|\bweekly\b|\bmonthly\b/.test(lower)) {
    const hasTime = /\bat\b|\bam\b|\bpm\b|\b(\d{1,2}):(\d{2})\b|\bmorning\b|\bafternoon\b|\bevening\b/.test(lower);
    if (!hasTime) {
      return buildClarificationIntent(
        "At what time of day should I remind you?",
        "The recurrence phrase lacks an explicit time.",
        ["time"],
      );
    }
    return null;
  }

  return null;
}

export interface AiInterpretResponse {
  intent: AiIntentResult;
  provider: string;
  model: string;
  latencyMs: number;
}

export async function interpretIntent(message: string, provider?: LlmProvider): Promise<AiInterpretResponse> {
  const start = Date.now();

  const quickIntent = parseQuickIntent(message);
  if (quickIntent) {
    return {
      intent: quickIntent,
      provider: "rule_parser",
      model: "rule_parser_v1",
      latencyMs: Date.now() - start,
    };
  }

  const client = provider ?? new OpenAiProvider();
  const intent = await client.interpret(message, {
    nowIso: new Date().toISOString(),
  });

  return {
    intent,
    provider: client.provider,
    model: client.model,
    latencyMs: Date.now() - start,
  };
}

export { LlmProviderConfigError };
