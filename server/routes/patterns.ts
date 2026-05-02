import type { Express, Request, Response, NextFunction } from "express";
import { storage, getPatterns } from "../storage";
import {
  analyzeTaskHistory,
  getInsights,
  suggestDeadline,
} from "../engines/pattern-engine";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerPatternRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/patterns/insights", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const patterns = await getPatterns(userId);
      const insights = getInsights(patterns);
      res.json({ insights, patternCount: patterns.length });
    } catch (error) {
      console.error("Pattern insights error:", error);
      res.status(500).json({ message: "Failed to get pattern insights" });
    }
  });

  app.post("/api/patterns/learn", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const patterns = await analyzeTaskHistory(userId, allTasks);
      const insights = getInsights(patterns);
      res.json({ learned: patterns.length, insights });
    } catch (error) {
      console.error("Pattern learning error:", error);
      res.status(500).json({ message: "Failed to analyze patterns" });
    }
  });

  app.post("/api/patterns/suggest-deadline", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { activity } = req.body;
      if (!activity || typeof activity !== "string") {
        return res.status(400).json({ message: "Activity is required" });
      }
      const patterns = await getPatterns(userId);
      const suggestion = suggestDeadline(activity, patterns);
      res.json({ suggestion });
    } catch (error) {
      console.error("Deadline suggestion error:", error);
      res.status(500).json({ message: "Failed to suggest deadline" });
    }
  });
}
