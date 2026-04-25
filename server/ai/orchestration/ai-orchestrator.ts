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

  const afterHome = /\bafter i get (home|to home)\b/.test(lower);
  const afterWork = /\bafter i get (to )?work\b/.test(lower);
  if (afterHome || afterWork) {
    const placeSlug = afterWork ? "work" : "home";
    const offset = parseOffsetMinutes(lower) ?? 5;
    const daily = /\bevery day\b|\bdaily\b/.test(lower);
    const title = text.replace(/^set a reminder to\s*/i, "").trim() || "Reminder";
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
          offsetMinutes: offset,
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

  if (/\bevery (day|daily)\b/.test(lower)) {
    const title = text.replace(/^set a reminder to\s*/i, "").trim() || "Reminder";
    return {
      type: "create_reminder",
      payload: {
        kind: "recurring",
        title,
        body: null,
        enabled: true,
        trigger: {
          type: "recurring_time",
          recurrence: {
            frequency: "daily",
            interval: 1,
          },
        },
      },
    };
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
