import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import passport from "passport";
import multer from "multer";
import {
  storage, createUser, getUserByEmail, recordFailedLogin, resetFailedLogins,
  createResetToken, verifyResetToken, consumeResetToken,
  setSecurityQuestion, getSecurityQuestion, verifySecurityAnswer,
  adminResetPassword,
} from "./storage";
import { z } from "zod";
import { insertTaskSchema, updateTaskSchema, reorderTasksSchema, registerSchema, loginSchema, type UpdateTask } from "@shared/schema";
import { PriorityEngine } from "../client/src/lib/priority-engine";
import { createGoogleSheetsAPI, type GoogleSheetsCredentials } from "./google-sheets-api";
import { generateChecklistPDF } from "./checklist-pdf";
import { processChecklistImage } from "./ocr-processor";
import { requireAuth } from "./auth";
import { getProvider, getAvailableProviders } from "./auth-providers";

/** Constant-time string comparison — prevents timing side-channel leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to burn the same CPU time, then return false
    const buf = Buffer.from(a, "utf8");
    timingSafeEqual(buf, buf);
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

// ── Rate limiters ───────────────────────────────────────────────────────────
// Strict limiter for auth endpoints — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts — try again in 15 minutes" },
  // use default keyGenerator (handles IPv6 correctly)
});

// Registration limiter — even stricter: 3 per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts — try again in 1 hour" },
});

// ── Invite-code / registration gate ─────────────────────────────────────────
// In production, set REGISTRATION_MODE=invite in .env and provide INVITE_CODE.
// Allowed values: "open" (anyone), "invite" (requires code), "closed" (no signups).
const REGISTRATION_MODE = process.env.REGISTRATION_MODE || (process.env.NODE_ENV === "production" ? "invite" : "open");
const INVITE_CODE = process.env.INVITE_CODE || "";

export async function registerRoutes(app: Express): Promise<Server> {

  // ════════════════════════════════════════════════════════════════════════
  //  Auth routes (public, rate-limited)
  // ════════════════════════════════════════════════════════════════════════

  app.post("/api/auth/register", registerLimiter, async (req: Request, res: Response) => {
    try {
      // ── Registration gate ──────────────────────────────────────────────
      if (REGISTRATION_MODE === "closed") {
        return res.status(403).json({ message: "Registration is currently closed" });
      }
      if (REGISTRATION_MODE === "invite") {
        const code = typeof req.body.inviteCode === "string" ? req.body.inviteCode : "";
        if (!INVITE_CODE) {
          return res.status(403).json({ message: "Registration requires an invite code, but none is configured on the server" });
        }
        if (!safeEqual(code, INVITE_CODE)) {
          return res.status(403).json({ message: "Invalid invite code" });
        }
      }

      const { email, password, displayName } = registerSchema.parse(req.body);
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const user = await createUser(email, password, displayName);
      // Auto-login after registration
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Registration succeeded but login failed" });
        res.status(201).json(user);
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Registration failed" });
      }
    }
  });

  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response, next) => {
    try {
      // ── Account lockout check ────────────────────────────────────────
      const { email } = req.body;
      if (email) {
        const dbUser = await getUserByEmail(email);
        if (dbUser?.lockedUntil && new Date(dbUser.lockedUntil) > new Date()) {
          const mins = Math.ceil((new Date(dbUser.lockedUntil).getTime() - Date.now()) / 60000);
          return res.status(423).json({
            message: `Account locked due to too many failed attempts. Try again in ${mins} minute(s).`,
          });
        }
      }

      passport.authenticate("local", async (err: any, user: any, info: any) => {
        if (err) return next(err);
        if (!user) {
          // Record the failed attempt
          if (email) await recordFailedLogin(email);
          return res.status(401).json({ message: info?.message || "Invalid credentials" });
        }
        // Successful login — reset failed attempts
        await resetFailedLogins(user.email);
        req.login(user, (err) => {
          if (err) return next(err);
          res.json(user);
        });
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      // Destroy the session entirely so back-button can't restore it
      req.session.destroy((destroyErr) => {
        if (destroyErr) console.error("[auth] Session destroy error:", destroyErr);
        res.clearCookie("axtask.sid");
        res.json({ message: "Logged out" });
      });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    // Prevent browser from caching auth state — critical for back-button after logout
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Return registration mode + auth provider so the UI can adapt
  app.get("/api/auth/config", (_req: Request, res: Response) => {
    const authProvider = getProvider();
    const providers = getAvailableProviders();
    const loginUrls: Record<string, string> = {
      workos: "/api/auth/workos/login",
      google: "/api/auth/google/login",
      replit: "/api/auth/replit/login",
      local: "",
    };
    res.json({
      registrationMode: REGISTRATION_MODE,
      authProvider,
      loginUrl: loginUrls[authProvider] || "",
      providers,
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Password Reset routes (public, rate-limited)
  // ════════════════════════════════════════════════════════════════════════

  // Tier 1: Request email-based password reset
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await getUserByEmail(email);
      // Always return success to prevent email enumeration
      if (!user || !user.passwordHash) {
        return res.json({ message: "If that email exists, a reset link has been sent.", method: "email" });
      }

      const result = await createResetToken(email, "email", 30);
      if (!result) {
        return res.json({ message: "If that email exists, a reset link has been sent.", method: "email" });
      }

      // In production, send email here. For local dev, log the token.
      const resetUrl = `${req.protocol}://${req.get("host")}/?reset_token=${result.token}`;
      console.log(`[PASSWORD RESET] Token for ${email}: ${resetUrl}`);

      // Check if security question is available as fallback
      const hasSecurityQuestion = !!user.securityQuestion;

      res.json({
        message: "If that email exists, a reset link has been sent.",
        method: "email",
        hasSecurityQuestion,
        // In dev, also return the token so the UI can use it directly
        ...(process.env.NODE_ENV === "development" ? { _devToken: result.token } : {}),
      });
    } catch (error) {
      res.status(500).json({ message: "Password reset request failed" });
    }
  });

  // Tier 2: Get security question for an email
  app.post("/api/auth/security-question", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const question = await getSecurityQuestion(email);
      if (!question) {
        return res.status(404).json({ message: "No security question set for this account" });
      }
      res.json({ question });
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve security question" });
    }
  });

  // Tier 2: Verify security answer → get reset token
  app.post("/api/auth/verify-security-answer", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email, answer } = req.body;
      if (!email || !answer) {
        return res.status(400).json({ message: "Email and answer are required" });
      }

      const valid = await verifySecurityAnswer(email, answer);
      if (!valid) {
        return res.status(401).json({ message: "Incorrect answer" });
      }

      // Issue a reset token via security_question method
      const result = await createResetToken(email, "security_question", 15);
      if (!result) {
        return res.status(500).json({ message: "Failed to create reset token" });
      }

      res.json({ token: result.token, expiresAt: result.expiresAt });
    } catch (error) {
      res.status(500).json({ message: "Security verification failed" });
    }
  });

  // Final step: Reset password using a valid token
  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const success = await consumeResetToken(token, newPassword);
      if (!success) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      res.status(500).json({ message: "Password reset failed" });
    }
  });

  // Tier 3: Admin reset — requires authenticated admin
  app.post("/api/auth/admin/reset-password", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { targetEmail, newPassword } = req.body;
      if (!targetEmail || !newPassword) {
        return res.status(400).json({ message: "Target email and new password are required" });
      }

      const success = await adminResetPassword(targetEmail, newPassword);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: `Password reset for ${targetEmail}` });
    } catch (error) {
      res.status(500).json({ message: "Admin password reset failed" });
    }
  });

  // Set/update security question (requires login)
  app.post("/api/auth/security-question/set", requireAuth, async (req: Request, res: Response) => {
    try {
      const { question, answer } = req.body;
      if (!question || !answer) {
        return res.status(400).json({ message: "Question and answer are required" });
      }
      if (answer.trim().length < 2) {
        return res.status(400).json({ message: "Answer must be at least 2 characters" });
      }

      await setSecurityQuestion(req.user!.id, question, answer);
      res.json({ message: "Security question updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to set security question" });
    }
  });

  // Check if current user has a security question set
  app.get("/api/auth/security-question/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await getUserByEmail(req.user!.email);
      res.json({ hasSecurityQuestion: !!user?.securityQuestion, question: user?.securityQuestion || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to check security question status" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Task routes (protected — require login)
  // ════════════════════════════════════════════════════════════════════════

  // Get all tasks
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.user!.id);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get task stats (must come before :id route)
  app.get("/api/tasks/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getTaskStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task stats" });
    }
  });

  // Search tasks
  app.get("/api/tasks/search/:query", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.searchTasks(req.user!.id, req.params.query);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to search tasks" });
    }
  });

  // Get tasks by status
  app.get("/api/tasks/status/:status", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksByStatus(req.user!.id, req.params.status);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by status" });
    }
  });

  // Get tasks by priority
  app.get("/api/tasks/priority/:priority", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksByPriority(req.user!.id, req.params.priority);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by priority" });
    }
  });

  // Get task by ID
  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(req.user!.id, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Bulk import tasks (must be before /api/tasks POST)
  app.post("/api/tasks/import", requireAuth, async (req, res) => {
    try {
      const { tasks: taskList } = req.body;
      if (!Array.isArray(taskList) || taskList.length === 0) {
        return res.status(400).json({ message: "No tasks provided" });
      }

      if (taskList.length > 50000) {
        return res.status(400).json({ message: "Maximum 50,000 tasks per import" });
      }

      const userId = req.user!.id;

      const validTasks: any[] = [];
      const errors: { index: number; error: string }[] = [];

      for (let i = 0; i < taskList.length; i++) {
        try {
          const validated = insertTaskSchema.parse(taskList[i]);
          validTasks.push(validated);
        } catch (err: any) {
          errors.push({ index: i, error: err.message || "Validation failed" });
        }
      }

      let inserted: any[] = [];
      if (validTasks.length > 0) {
        inserted = await storage.createTasksBulk(userId, validTasks);

        const existingTasks = await storage.getTasks(userId);

        const UPDATE_BATCH = 500;
        for (let i = 0; i < inserted.length; i += UPDATE_BATCH) {
          const batch = inserted.slice(i, i + UPDATE_BATCH);
          const updates: UpdateTask[] = [];

          for (const task of batch) {
            try {
              const contextTasks = existingTasks.filter(t => t.id !== task.id);
              const priorityResult = await PriorityEngine.calculatePriority(
                task.activity, task.notes || "", task.urgency, task.impact, task.effort,
                contextTasks
              );
              const classification = PriorityEngine.classifyTask(task.activity, task.notes || "");
              updates.push({
                id: task.id,
                priority: priorityResult.priority,
                priorityScore: Math.round(priorityResult.score * 10),
                classification,
                isRepeated: priorityResult.isRepeated,
              });
            } catch (e) {
              const classification = PriorityEngine.classifyTask(task.activity, task.notes || "");
              updates.push({
                id: task.id,
                priority: "Low",
                priorityScore: 0,
                classification,
                isRepeated: false,
              });
            }
          }

          await storage.bulkUpdateTasks(userId, updates);
        }
      }

      res.status(201).json({
        imported: inserted.length,
        failed: errors.length,
        total: taskList.length,
        errors: errors.slice(0, 50),
      });
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ message: "Failed to import tasks" });
    }
  });

  // Create new task
  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const userId = req.user!.id;

      let task = await storage.createTask(userId, validatedData);

      const allTasks = await storage.getTasks(userId);
      const priorityResult = await PriorityEngine.calculatePriority(
        task.activity,
        task.notes || "",
        task.urgency,
        task.impact,
        task.effort,
        allTasks.filter(t => t.id !== task.id)
      );

      const classification = PriorityEngine.classifyTask(task.activity, task.notes || "");

      task = await storage.updateTask(userId, {
        id: task.id,
        priority: priorityResult.priority,
        priorityScore: Math.round(priorityResult.score * 10),
        classification,
        isRepeated: priorityResult.isRepeated,
      }) || task;

      res.status(201).json(task);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to create task" });
      }
    }
  });

  // Update task
  app.put("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const validatedData = updateTaskSchema.parse({
        ...req.body,
        id: req.params.id,
      });
      const userId = req.user!.id;

      let task = await storage.updateTask(userId, validatedData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (validatedData.activity || validatedData.notes) {
        const allTasks = await storage.getTasks(userId);
        const priorityResult = await PriorityEngine.calculatePriority(
          task!.activity,
          task!.notes || "",
          task!.urgency,
          task!.impact,
          task!.effort,
          allTasks.filter(t => t.id !== task!.id)
        );

        const classification = PriorityEngine.classifyTask(task!.activity, task!.notes || "");

        task = await storage.updateTask(userId, {
          id: task!.id,
          priority: priorityResult.priority,
          priorityScore: Math.round(priorityResult.score * 10),
          classification,
          isRepeated: priorityResult.isRepeated,
        }) || task;
      }

      res.json(task);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to update task" });
      }
    }
  });

  // Delete task
  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteTask(req.user!.id, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Reorder tasks
  app.patch("/api/tasks/reorder", requireAuth, async (req, res) => {
    try {
      const { taskIds } = reorderTasksSchema.parse(req.body);
      await storage.reorderTasks(req.user!.id, taskIds);
      res.json({ message: "Tasks reordered successfully" });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to reorder tasks" });
      }
    }
  });

  // Recalculate all priorities
  app.post("/api/tasks/recalculate", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);

      for (const task of allTasks) {
        const priorityResult = await PriorityEngine.calculatePriority(
          task.activity,
          task.notes || "",
          task.urgency,
          task.impact,
          task.effort,
          allTasks.filter(t => t.id !== task.id)
        );

        const classification = PriorityEngine.classifyTask(task.activity, task.notes || "");

        await storage.updateTask(userId, {
          id: task.id,
          priority: priorityResult.priority,
          priorityScore: Math.round(priorityResult.score * 10),
          classification,
          isRepeated: priorityResult.isRepeated,
        });
      }

      res.json({ message: "All priorities recalculated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to recalculate priorities" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Google Sheets routes (protected)
  // ════════════════════════════════════════════════════════════════════════

  app.get("/api/google-sheets/auth-url", requireAuth, async (req, res) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({
          message: "Google API credentials not configured. Please check your environment variables."
        });
      }
      const googleSheets = createGoogleSheetsAPI();
      const authUrl = googleSheets.generateAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  app.post("/api/google-sheets/auth-callback", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Authorization code required" });
      }
      const googleSheets = createGoogleSheetsAPI();
      const tokens = await googleSheets.getTokens(code);
      res.json({
        message: "Authentication successful",
        tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to exchange authorization code" });
    }
  });

  app.get("/api/google-sheets/spreadsheet/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { accessToken, refreshToken } = req.query;

      if (!accessToken) {
        return res.status(400).json({ message: "Access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken: accessToken as string,
        refreshToken: refreshToken as string
      });

      const info = await googleSheets.getSpreadsheetInfo(id);
      res.json(info);
    } catch (error) {
      res.status(500).json({ message: "Failed to get spreadsheet info" });
    }
  });

  app.post("/api/google-sheets/create-spreadsheet", requireAuth, async (req, res) => {
    try {
      const { title, accessToken, refreshToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ message: "Access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const spreadsheetId = await googleSheets.createTaskSpreadsheet(title);
      res.json({ 
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create spreadsheet" });
    }
  });

  app.post("/api/google-sheets/export", requireAuth, async (req, res) => {
    try {
      const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

      if (!spreadsheetId || !accessToken) {
        return res.status(400).json({ message: "Spreadsheet ID and access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const tasks = await storage.getTasks(req.user!.id);
      const result = await googleSheets.exportTasks(spreadsheetId, tasks, sheetName);
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to export tasks to Google Sheets" });
    }
  });

  app.post("/api/google-sheets/import", requireAuth, async (req, res) => {
    try {
      const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;
      const userId = req.user!.id;

      if (!spreadsheetId || !accessToken) {
        return res.status(400).json({ message: "Spreadsheet ID and access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const importedTasks = await googleSheets.importTasks(spreadsheetId, sheetName);

      const processedTasks = [];
      for (const taskData of importedTasks) {
        try {
          const { id, ...taskWithoutId } = taskData;
          const validatedData = insertTaskSchema.parse(taskWithoutId);

          let task = await storage.createTask(userId, validatedData);

          const allTasks = await storage.getTasks(userId);
          const priorityResult = await PriorityEngine.calculatePriority(
            task.activity,
            task.notes || "",
            task.urgency,
            task.impact,
            task.effort,
            allTasks.filter(t => t.id !== task.id)
          );

          const classification = PriorityEngine.classifyTask(task.activity, task.notes || "");

          const updatedTask = await storage.updateTask(userId, {
            id: task.id,
            priority: priorityResult.priority,
            priorityScore: Math.round(priorityResult.score * 10),
            classification,
            isRepeated: priorityResult.isRepeated,
          });

          if (updatedTask) task = updatedTask;
          processedTasks.push(task);
        } catch (error) {
          console.warn(`Failed to process imported task:`, error);
        }
      }

      res.json({
        message: "Import completed",
        imported: processedTasks.length,
        total: importedTasks.length
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import tasks from Google Sheets" });
    }
  });

  app.post("/api/google-sheets/sync", requireAuth, async (req, res) => {
    try {
      const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

      if (!spreadsheetId || !accessToken) {
        return res.status(400).json({ message: "Spreadsheet ID and access token required" });
      }

      const googleSheets = createGoogleSheetsAPI({
        accessToken,
        refreshToken
      });

      const localTasks = await storage.getTasks(req.user!.id);
      const syncResult = await googleSheets.syncTasks(spreadsheetId, localTasks, sheetName);
      
      res.json({
        message: "Sync completed",
        exported: syncResult.exported,
        conflicts: syncResult.conflicts.length,
        conflictDetails: syncResult.conflicts
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to sync with Google Sheets" });
    }
  });

  // ── Checklist (PDF download & OCR scan) ──────────────────────────────────
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  const ocrLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many scan requests — try again in a few minutes" },
  });

  const checklistApplySchema = z.object({
    updates: z.array(z.object({
      taskId: z.string().min(1),
      status: z.enum(["pending", "in-progress", "completed"]),
    })).min(1).max(500),
  });

  app.get("/api/checklist/:date", requireAuth, async (req, res) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }

      const allTasks = await storage.getTasks(req.user!.id);
      const dayTasks = allTasks.filter(t => t.date === date);

      const userName = req.user!.displayName || req.user!.email;
      const pdfDoc = generateChecklistPDF(dayTasks, date, userName);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="AxTask-Checklist-${date}.pdf"`);

      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      console.error("Checklist PDF error:", error);
      res.status(500).json({ message: "Failed to generate checklist" });
    }
  });

  app.post("/api/checklist/scan", requireAuth, ocrLimiter, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const date = typeof req.body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
        ? req.body.date
        : undefined;
      const allTasks = await storage.getTasks(req.user!.id);
      const dayTasks = date
        ? allTasks.filter(t => t.date === date)
        : allTasks.filter(t => t.status !== "completed");

      const result = await processChecklistImage(req.file.buffer, dayTasks);

      res.json(result);
    } catch (error) {
      console.error("OCR scan error:", error);
      res.status(500).json({ message: "Failed to process checklist image" });
    }
  });

  app.post("/api/checklist/apply", requireAuth, async (req, res) => {
    try {
      const parsed = checklistApplySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const { updates } = parsed.data;
      const userId = req.user!.id;
      const results: { taskId: string; status: string }[] = [];

      for (const { taskId, status } of updates) {
        const task = await storage.getTask(userId, taskId);
        if (!task) continue;

        await storage.updateTask(userId, { id: taskId, status });
        results.push({ taskId, status });
      }

      res.json({ updated: results.length, results });
    } catch (error) {
      console.error("Checklist apply error:", error);
      res.status(500).json({ message: "Failed to apply updates" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Planner / AI Agent routes (protected)
  // ════════════════════════════════════════════════════════════════════════

  function isOverdueTask(t: { date: string; time: string | null }, todayStr: string, now: Date): boolean {
    if (t.date < todayStr) return true;
    if (t.date === todayStr && t.time) {
      const [h, m] = t.time.split(":").map(Number);
      const taskTime = new Date(now);
      taskTime.setHours(h, m, 0, 0);
      return taskTime < now;
    }
    return false;
  }

  app.get("/api/planner/briefing", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const pendingTasks = allTasks.filter(t => t.status !== "completed");

      const overdueTasks = pendingTasks.filter(t => isOverdueTask(t, todayStr, now));

      const dueTodayTasks = pendingTasks.filter(t => t.date === todayStr);

      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      const dueWithinHourTasks = pendingTasks.filter(t => {
        if (t.date !== todayStr || !t.time) return false;
        const [h, m] = t.time.split(":").map(Number);
        const taskTime = new Date(now);
        taskTime.setHours(h, m, 0, 0);
        return taskTime >= now && taskTime <= oneHourFromNow;
      });

      const weekDays: { date: string; dayName: string; count: number; load: "none" | "light" | "moderate" | "heavy" }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const dayTasks = allTasks.filter(t => t.date === dateStr && t.status !== "completed");
        const cnt = dayTasks.length;
        weekDays.push({
          date: dateStr,
          dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
          count: cnt,
          load: cnt === 0 ? "none" : cnt <= 2 ? "light" : cnt <= 5 ? "moderate" : "heavy",
        });
      }

      const scoredTasks = pendingTasks.map(t => {
        let urgencyBoost = 0;
        const daysUntilDue = Math.floor((new Date(t.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue < 0) urgencyBoost = 30;
        else if (daysUntilDue === 0) urgencyBoost = 20;
        else if (daysUntilDue === 1) urgencyBoost = 10;
        else if (daysUntilDue <= 3) urgencyBoost = 5;

        const combinedScore = (t.priorityScore || 0) + urgencyBoost;

        let reason = "";
        if (daysUntilDue < 0) reason = `Overdue by ${Math.abs(daysUntilDue)} day(s)`;
        else if (daysUntilDue === 0 && t.time) reason = `Due today at ${t.time}`;
        else if (daysUntilDue === 0) reason = "Due today";
        else if (daysUntilDue === 1) reason = "Due tomorrow";
        else if (daysUntilDue <= 3) reason = `Due in ${daysUntilDue} days`;

        if (t.priority === "Highest" || t.priority === "High") {
          reason = reason ? `${t.priority} priority — ${reason}` : `${t.priority} priority`;
        }

        return { task: t, combinedScore, reason };
      });

      scoredTasks.sort((a, b) => b.combinedScore - a.combinedScore);
      const topTasks = scoredTasks.slice(0, 3).map(s => ({
        ...s.task,
        reason: s.reason || `Priority: ${s.task.priority}`,
      }));

      const thisWeekTotal = weekDays.reduce((sum, d) => sum + d.count, 0);

      res.json({
        today: todayStr,
        overdue: { count: overdueTasks.length, tasks: overdueTasks.slice(0, 5) },
        dueToday: { count: dueTodayTasks.length, tasks: dueTodayTasks.slice(0, 5) },
        dueWithinHour: { count: dueWithinHourTasks.length, tasks: dueWithinHourTasks },
        thisWeek: { total: thisWeekTotal, days: weekDays },
        topRecommended: topTasks,
        totalPending: pendingTasks.length,
      });
    } catch (error) {
      console.error("Planner briefing error:", error);
      res.status(500).json({ message: "Failed to generate planner briefing" });
    }
  });

  app.post("/api/planner/ask", requireAuth, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        return res.status(400).json({ message: "Question is required" });
      }

      const userId = req.user!.id;
      const allTasks = await storage.getTasks(userId);
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const pendingTasks = allTasks.filter(t => t.status !== "completed");
      const q = question.toLowerCase();

      let answer = "";
      let relatedTasks: typeof allTasks = [];

      if (q.match(/\b(most urgent|highest priority|what.*first|what.*next|important)\b/)) {
        const sorted = [...pendingTasks].map(t => {
          let urgencyBoost = 0;
          const daysUntilDue = Math.floor((new Date(t.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilDue < 0) urgencyBoost = 30;
          else if (daysUntilDue === 0) urgencyBoost = 20;
          else if (daysUntilDue === 1) urgencyBoost = 10;
          else if (daysUntilDue <= 3) urgencyBoost = 5;
          return { task: t, combinedScore: (t.priorityScore || 0) + urgencyBoost };
        }).sort((a, b) => b.combinedScore - a.combinedScore);
        relatedTasks = sorted.slice(0, 5).map(s => s.task);
        if (relatedTasks.length === 0) {
          answer = "You have no pending tasks right now. Great job!";
        } else {
          answer = `Your most urgent tasks are:\n${relatedTasks.map((t, i) => `${i + 1}. ${t.activity} (${t.priority}, due ${t.date})`).join("\n")}`;
        }
      } else if (q.match(/\b(overdue|late|missed|past due)\b/)) {
        relatedTasks = pendingTasks.filter(t => isOverdueTask(t, todayStr, now));
        if (relatedTasks.length === 0) {
          answer = "No overdue tasks. You're all caught up!";
        } else {
          answer = `You have ${relatedTasks.length} overdue task(s):\n${relatedTasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.activity} (was due ${t.date})`).join("\n")}`;
        }
      } else if (q.match(/\b(due today|today's|today)\b/)) {
        relatedTasks = pendingTasks.filter(t => t.date === todayStr);
        if (relatedTasks.length === 0) {
          answer = "You have no tasks due today.";
        } else {
          answer = `You have ${relatedTasks.length} task(s) due today:\n${relatedTasks.map((t, i) => `${i + 1}. ${t.activity}${t.time ? ` at ${t.time}` : ""}`).join("\n")}`;
        }
      } else if (q.match(/\b(summarize|summary|how.*doing|status|overview)\b/)) {
        const completed = allTasks.filter(t => t.status === "completed").length;
        const overdue = pendingTasks.filter(t => isOverdueTask(t, todayStr, now)).length;
        const dueToday = pendingTasks.filter(t => t.date === todayStr).length;
        answer = `Here's your overview:\n• ${allTasks.length} total tasks (${completed} completed)\n• ${pendingTasks.length} pending\n• ${overdue} overdue\n• ${dueToday} due today`;
      } else if (q.match(/\b(this week|week|upcoming)\b/)) {
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() + (6 - now.getDay()));
        const endStr = weekEnd.toISOString().split("T")[0];
        relatedTasks = pendingTasks.filter(t => t.date >= todayStr && t.date <= endStr);
        if (relatedTasks.length === 0) {
          answer = "No tasks due this week.";
        } else {
          answer = `You have ${relatedTasks.length} task(s) due this week:\n${relatedTasks.slice(0, 8).map((t, i) => `${i + 1}. ${t.activity} (${t.date})`).join("\n")}`;
        }
      } else if (q.match(/\b(completed|done|finished)\b/)) {
        relatedTasks = allTasks.filter(t => t.status === "completed");
        answer = `You've completed ${relatedTasks.length} task(s) total.`;
        relatedTasks = relatedTasks.slice(0, 5);
      } else {
        const matches = pendingTasks.filter(t =>
          t.activity.toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q)
        );
        if (matches.length > 0) {
          relatedTasks = matches.slice(0, 5);
          answer = `Found ${matches.length} task(s) matching "${question}":\n${relatedTasks.map((t, i) => `${i + 1}. ${t.activity} (${t.priority}, due ${t.date})`).join("\n")}`;
        } else {
          answer = "I can help you with questions like:\n• \"What's most urgent?\"\n• \"What's due today?\"\n• \"Show overdue tasks\"\n• \"Summarize my week\"\n• \"What's due this week?\"";
        }
      }

      res.json({ answer, relatedTasks: relatedTasks.slice(0, 5) });
    } catch (error) {
      console.error("Planner Q&A error:", error);
      res.status(500).json({ message: "Failed to answer question" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
