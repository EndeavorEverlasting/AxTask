import type { AiIntentResult } from "../schemas/intent-result";

export interface AiInterpretContext {
  nowIso: string;
  timezone?: string;
}

export interface LlmProvider {
  readonly provider: string;
  readonly model: string;
  interpret(message: string, context: AiInterpretContext): Promise<AiIntentResult>;
}

export class LlmProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderConfigError";
  }
}
