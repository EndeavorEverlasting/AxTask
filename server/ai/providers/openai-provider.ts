import { LlmProviderConfigError, type AiInterpretContext, type LlmProvider } from "../contracts/llm-provider";
import { aiIntentResultSchema, buildClarificationIntent, type AiIntentResult } from "../schemas/intent-result";

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export class OpenAiProvider implements LlmProvider {
  readonly provider = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      throw new LlmProviderConfigError("OPENAI_API_KEY is not configured.");
    }
    this.apiKey = apiKey;
    this.model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
    this.baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async interpret(message: string, context: AiInterpretContext): Promise<AiIntentResult> {
    const systemPrompt =
      "You are AxTask's intent parser. Return ONLY strict JSON matching one of these shapes: " +
      "{type:'create_reminder',payload:{kind,title,body?,enabled?,trigger}} or " +
      "{type:'clarification',payload:{question,reason,missingFields[]}}. " +
      "Never guess vague recurrence. Use clarification when user intent is ambiguous.";

    const userPrompt = JSON.stringify({
      message,
      context,
      rules: [
        "For 'after I get home/work', use trigger type location_arrival_offset or location_arrival.",
        "If phrase is vague like 'every now and again', return clarification.",
        "Offset minutes must be integer 1..1440.",
      ],
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${text.slice(0, 400)}`);
    }

    const body = (await response.json()) as OpenAiChatResponse;
    const raw = body.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return buildClarificationIntent(
        "Could you restate that reminder in one sentence?",
        "The assistant could not parse a structured response.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return buildClarificationIntent(
        "Could you restate that reminder in one sentence?",
        "The assistant returned invalid JSON.",
      );
    }

    const validated = aiIntentResultSchema.safeParse(parsed);
    if (!validated.success) {
      return buildClarificationIntent(
        "Could you rephrase with when and where the reminder should trigger?",
        "The assistant response did not match the required intent schema.",
      );
    }
    return validated.data;
  }
}
