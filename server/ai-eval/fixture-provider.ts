import { LlmProviderConfigError, type AiInterpretContext, type LlmProvider } from "../ai/contracts/llm-provider";
import { aiIntentResultSchema, type AiIntentResult } from "../ai/schemas/intent-result";
import type { AiIntentLlmStub, AiIntentLlmStubError, AiIntentLlmStubIntent } from "./types";

function isIntentStub(stub: NonNullable<AiIntentLlmStub>): stub is AiIntentLlmStubIntent {
  return "intent" in stub && stub.intent != null;
}

function isErrorStub(stub: NonNullable<AiIntentLlmStub>): stub is AiIntentLlmStubError {
  return "error" in stub;
}

/**
 * Deterministic LlmProvider backed by case.llmStub.
 * Never calls a network LLM.
 */
export class FixtureLlmProvider implements LlmProvider {
  readonly provider = "fixture";
  readonly model = "fixture_v1";

  constructor(private readonly stub: NonNullable<AiIntentLlmStub>) {}

  async interpret(_message: string, _context: AiInterpretContext): Promise<AiIntentResult> {
    if (isIntentStub(this.stub)) {
      return this.stub.intent;
    }

    if (!isErrorStub(this.stub)) {
      throw new Error("FixtureLlmProvider received an unrecognized llmStub shape.");
    }

    switch (this.stub.error) {
      case "config":
        throw new LlmProviderConfigError("OPENAI_API_KEY is not configured. (fixture)");
      case "timeout":
        throw new Error("LLM request timed out (fixture)");
      case "schema_invalid": {
        // Fail closed: parse throws ZodError when invalidIntent does not match schema.
        const parsed = aiIntentResultSchema.parse(this.stub.invalidIntent ?? {});
        // If a fixture accidentally supplies a valid intent, still reject as schema_invalid.
        throw new Error(
          `schema_invalid stub unexpectedly parsed as valid intent type=${parsed.type}`,
        );
      }
      default: {
        const _exhaustive: never = this.stub.error;
        throw new Error(`Unhandled fixture error: ${String(_exhaustive)}`);
      }
    }
  }
}

export function buildFixtureProvider(stub: AiIntentLlmStub): FixtureLlmProvider | undefined {
  if (stub == null) return undefined;
  return new FixtureLlmProvider(stub);
}
