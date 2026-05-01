import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { executeCreateReminderIntent } from "../ai/tools/create-reminder";
import { executeCreateTaskIntent } from "../ai/tools/create-task";
import { interpretIntent, LlmProviderConfigError } from "../ai/orchestration/ai-orchestrator";
import { aiConfidenceMeta } from "../ai/meta-confidence";
import type { AiIntentResult } from "../ai/schemas/intent-result";
import {
  logAiInteraction,
  markAiInteractionAccepted,
  markAiInteractionRejected,
} from "../storage/ai";

const aiChatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(1).max(200).optional(),
});

const interactionFeedbackSchema = z.object({
  verdict: z.enum(["correct", "wrong", "needs_edit"]),
});

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

function buildAiMeta(parsed: {
  provider: string;
  model: string;
  latencyMs: number;
  intent: AiIntentResult;
}) {
  const cm = aiConfidenceMeta({
    provider: parsed.provider,
    intentType: parsed.intent.type,
  });
  return {
    provider: parsed.provider,
    model: parsed.model,
    latencyMs: parsed.latencyMs,
    confidence: cm.confidence,
    fallbackLayer: cm.fallbackLayer,
  };
}

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

      if (interaction?.id) {
        if (parsed.intent.type === "clarification") {
          await markAiInteractionRejected(interaction.id, req.user!.id, parsed.intent.payload.reason);
        } else {
          await markAiInteractionAccepted(interaction.id, req.user!.id);
        }
      }

      res.json({
        intent: parsed.intent,
        meta: {
          interactionId: interaction?.id ?? null,
          ...buildAiMeta(parsed),
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

  app.post("/api/ai/interactions/:id/feedback", requireAuth, async (req, res) => {
    try {
      const body = interactionFeedbackSchema.parse(req.body ?? {});
      const id = req.params.id;
      const userId = req.user!.id;

      if (body.verdict === "correct") {
        const row = await markAiInteractionAccepted(id, userId);
        if (!row) return res.status(404).json({ message: "Interaction not found" });
        return res.json({ ok: true });
      }

      const reason =
        body.verdict === "wrong" ? "user_feedback_wrong" : "user_feedback_needs_edit";
      const row = await markAiInteractionRejected(id, userId, reason);
      if (!row) return res.status(404).json({ message: "Interaction not found" });
      return res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      return res.status(500).json({ message: "Failed to record feedback" });
    }
  });

  app.post("/api/ai/execute", requireAuth, async (req, res) => {
    let interactionId: string | null = null;
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
      interactionId = interaction?.id ?? null;

      const meta = {
        interactionId: interaction?.id ?? null,
        ...buildAiMeta(parsed),
      };

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
          meta,
        });
      }

      if (parsed.intent.type === "create_task") {
        const result = await executeCreateTaskIntent(req.user!.id, parsed.intent);
        if (!result.ok) {
          if (interaction?.id) {
            await markAiInteractionRejected(interaction.id, req.user!.id, result.reason);
          }
          return res.json({
            type: "clarification",
            clarification: result.clarification,
            reason: result.reason,
            interactionId: interaction?.id ?? null,
            meta,
          });
        }

        if (interaction?.id) {
          await markAiInteractionAccepted(interaction.id, req.user!.id);
        }
        return res.status(201).json({
          type: "action_result",
          action: "create_task",
          message: result.message,
          taskId: result.taskId,
          reminderId: null,
          triggerId: null,
          taskReminderId: null,
          interactionId: interaction?.id ?? null,
          meta,
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
            meta,
          });
        }

        if (interaction?.id) {
          await markAiInteractionAccepted(interaction.id, req.user!.id);
        }
        return res.status(201).json({
          type: "action_result",
          action: "create_reminder",
          persistence: result.persistence,
          message: result.message,
          reminderId: result.persistence === "ops" ? result.reminderId : null,
          triggerId: result.persistence === "ops" ? result.triggerId : null,
          taskReminderId: result.persistence === "task_reminder" ? result.taskReminderId : null,
          taskId: null,
          interactionId: interaction?.id ?? null,
          meta,
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
        meta,
      });
    } catch (error) {
      if (interactionId) {
        await markAiInteractionRejected(interactionId, req.user!.id, "execution_error");
      }
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
