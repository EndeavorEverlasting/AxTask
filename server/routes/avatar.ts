import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { listAvatarVoiceOpeners } from "../engines/dialogue-engine";
import { getPublicArchetypeContinuumForUser } from "../lib/archetype-continuum";
import { getLeaderboard } from "../services/leaderboard-service";
import {
  getOfflineGeneratorStatus,
  buyOfflineGenerator,
  upgradeOfflineGenerator,
  claimOfflineGeneratorCoins,
  getOfflineSkillTree,
  unlockOfflineSkill,
  getAvatarProfiles,
  engageAvatarMission,
  spendCoinsForAvatarBoost,
  getAvatarSkillTree,
  unlockAvatarSkill,
} from "../storage";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

const leaderboardQuerySchema = z.object({
  category: z.enum(["coins", "streak", "contributions"]).default("coins"),
  period: z.enum(["all", "week"]).default("all"),
});

const offlineSkillUnlockSchema = z.object({
  skillKey: z.string().min(2).max(80),
});

const avatarEngageSchema = z.object({
  sourceType: z.enum(["task", "feedback", "post"]),
  sourceRef: z.string().min(2).max(160),
  text: z.string().min(1).max(2000),
  completed: z.boolean().default(false),
});

const avatarSpendSchema = z.object({
  coins: z.number().int().min(1).max(10000),
});

const avatarSkillUnlockSchema = z.object({
  skillKey: z.string().min(2).max(80),
});

export function registerAvatarRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/leaderboard", requireAuth, async (req, res) => {
    try {
      const query = leaderboardQuerySchema.parse({
        category: req.query.category,
        period: req.query.period,
      });
      const result = await getLeaderboard(req.user!.id, query.category, query.period);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid leaderboard query" });
      }
      console.error("[leaderboard]", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/gamification/offline-generator", requireAuth, async (req, res) => {
    try {
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offline generator status" });
    }
  });

  app.post("/api/gamification/offline-generator/buy", requireAuth, async (req, res) => {
    try {
      const result = await buyOfflineGenerator(req.user!.id);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.status(201).json({ ...result, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to buy offline generator" });
    }
  });

  app.post("/api/gamification/offline-generator/upgrade", requireAuth, async (req, res) => {
    try {
      const result = await upgradeOfflineGenerator(req.user!.id);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json({ ...result, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to upgrade offline generator" });
    }
  });

  app.post("/api/gamification/offline-generator/claim", requireAuth, async (req, res) => {
    try {
      const result = await claimOfflineGeneratorCoins(req.user!.id);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json({ ...result, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to claim offline coins" });
    }
  });

  app.get("/api/gamification/offline-skills", requireAuth, async (req, res) => {
    try {
      const skills = await getOfflineSkillTree(req.user!.id);
      res.json(skills);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offline skills" });
    }
  });

  app.post("/api/gamification/offline-skills/unlock", requireAuth, async (req, res) => {
    try {
      const { skillKey } = offlineSkillUnlockSchema.parse(req.body);
      const result = await unlockOfflineSkill(req.user!.id, skillKey);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const skills = await getOfflineSkillTree(req.user!.id);
      const status = await getOfflineGeneratorStatus(req.user!.id);
      res.json({ ...result, skills, status });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to unlock offline skill" });
    }
  });

  app.get("/api/gamification/avatars", requireAuth, async (req, res) => {
    try {
      const [avatars, archetypeContinuum] = await Promise.all([
        getAvatarProfiles(req.user!.id),
        getPublicArchetypeContinuumForUser(req.user!.id),
      ]);
      res.json({ avatars, archetypeContinuum });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch avatars" });
    }
  });

  /**
   * Lightweight read-only feed of persona openers per avatar. The client
   * caches this (TanStack Query `staleTime: Infinity`) and picks a random
   * opener when rendering a feedback nudge so the dialog feels tied to a
   * companion instead of generic copy. See docs/FEEDBACK_AVATAR_NUDGES.md.
   */
  app.get("/api/gamification/avatar-voices", requireAuth, async (_req, res) => {
    try {
      const voices = listAvatarVoiceOpeners();
      res.json({ voices });
    } catch {
      res.status(500).json({ message: "Failed to fetch avatar voices" });
    }
  });

  app.post("/api/gamification/avatars/:avatarKey/engage", requireAuth, async (req, res) => {
    try {
      const payload = avatarEngageSchema.parse(req.body ?? {});
      const result = await engageAvatarMission({
        userId: req.user!.id,
        avatarKey: req.params.avatarKey,
        sourceType: payload.sourceType,
        sourceRef: payload.sourceRef,
        text: payload.text,
        completed: payload.completed,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to engage avatar mission" });
    }
  });

  app.post("/api/gamification/avatars/:avatarKey/spend", requireAuth, async (req, res) => {
    try {
      const { coins } = avatarSpendSchema.parse(req.body ?? {});
      const result = await spendCoinsForAvatarBoost(req.user!.id, req.params.avatarKey, coins);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to spend coins on avatar" });
    }
  });

  app.get("/api/gamification/avatar-skills", requireAuth, async (req, res) => {
    try {
      const skills = await getAvatarSkillTree(req.user!.id);
      res.json(skills);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch avatar skills" });
    }
  });

  app.post("/api/gamification/avatar-skills/unlock", requireAuth, async (req, res) => {
    try {
      const { skillKey } = avatarSkillUnlockSchema.parse(req.body);
      const result = await unlockAvatarSkill(req.user!.id, skillKey);
      if (!result.ok) {
        return res.status(400).json(result);
      }
      const skills = await getAvatarSkillTree(req.user!.id);
      res.json({ ...result, skills });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to unlock avatar skill" });
    }
  });
}
