import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { executeCreateReminderIntent } from "../ai/tools/create-reminder";
import { interpretIntent, LlmProviderConfigError } from "../ai/orchestration/ai-orchestrator";
import { logAiInteraction, markAiInteractionAccepted, markAiInteractionRejected } from "../storage/ai";

const aiChatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(1).max(200).optional(),
});

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerAiRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.post("/api/ai/interpret", requireAuth, async (req, res) => {
    try {
      const body = aiChatRequestSchema.parse(req.body ?? {});
      const parsed = await interpretIntent(body.message);

      const interaction = await logAiInteraction({
        userId: req.user!.id,
        sessionId: body.sessionId ?? null,
        rawMessage: body.message,
        intentKind: parsed.intent.type,
        structuredOutputJson: parsed.intent,
        provider: parsed.provider,
        model: parsed.model,
        latencyMs: parsed.latencyMs,
      });

      res.json({
        intent: parsed.intent,
        meta: {
          interactionId: interaction?.id ?? null,
          provider: parsed.provider,
          model: parsed.model,
          latencyMs: parsed.latencyMs,
        },
      });
    } catch (error) {
      if (error instanceof LlmProviderConfigError) {
        return res.status(503).json({ message: "AI provider is not configured on this server." });
      }
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to interpret message" });
    }
  });

  app.post("/api/ai/execute", requireAuth, async (req, res) => {
    try {
      const body = aiChatRequestSchema.parse(req.body ?? {});
      const parsed = await interpretIntent(body.message);

      const interaction = await logAiInteraction({
        userId: req.user!.id,
        sessionId: body.sessionId ?? null,
        rawMessage: body.message,
        intentKind: parsed.intent.type,
        structuredOutputJson: parsed.intent,
        provider: parsed.provider,
        model: parsed.model,
        latencyMs: parsed.latencyMs,
      });

      if (parsed.intent.type === "clarification") {
        if (interaction?.id) {
          await markAiInteractionRejected(interaction.id, req.user!.id, parsed.intent.payload.reason);
        }
        return res.json({
          type: "clarification",
          clarification: parsed.intent.payload.question,
          reason: parsed.intent.payload.reason,
          missingFields: parsed.intent.payload.missingFields,
          interactionId: interaction?.id ?? null,
        });
      }

      if (parsed.intent.type === "create_reminder") {
        const result = await executeCreateReminderIntent(req.user!.id, parsed.intent);
        if (!result.ok) {
          if (interaction?.id) {
            await markAiInteractionRejected(interaction.id, req.user!.id, result.reason);
          }
          return res.json({
            type: "clarification",
            clarification: result.clarification,
            reason: result.reason,
            interactionId: interaction?.id ?? null,
          });
        }

        if (interaction?.id) {
          await markAiInteractionAccepted(interaction.id, req.user!.id);
        }
        return res.status(201).json({
          type: "action_result",
          action: "create_reminder",
          message: result.message,
          reminderId: result.reminderId,
          triggerId: result.triggerId,
          interactionId: interaction?.id ?? null,
        });
      }

      if (interaction?.id) {
        await markAiInteractionRejected(interaction.id, req.user!.id, "unsupported_intent");
      }
      return res.status(400).json({
        message: "This intent type is not supported for execute yet.",
        reason: "unsupported_intent",
        intentType: (parsed.intent as { type: string }).type,
        interactionId: interaction?.id ?? null,
      });
    } catch (error) {
      if (error instanceof LlmProviderConfigError) {
        return res.status(503).json({ message: "AI provider is not configured on this server." });
      }
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to execute AI request" });
    }
  });
}
