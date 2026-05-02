import type { Express, Request, Response, NextFunction } from "express";
import {
  getSharedTasks,
  canAccessTask,
  getTaskCollaborators,
  isTaskOwner,
  getUserByPublicHandle,
  addCollaborator,
  updateCollaboratorRole,
  removeCollaborator,
} from "../storage";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerTaskCollaborationRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/tasks/shared", requireAuth, async (req, res) => {
    try {
      const shared = await getSharedTasks(req.user!.id);
      res.json(shared);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shared tasks" });
    }
  });

  app.get("/api/tasks/:id/collaborators", requireAuth, async (req, res) => {
    try {
      const access = await canAccessTask(req.user!.id, req.params.id);
      if (!access.canAccess) return res.status(403).json({ message: "Access denied" });
      const collaborators = await getTaskCollaborators(req.params.id);
      res.json(collaborators);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch collaborators" });
    }
  });

  app.post("/api/tasks/:id/collaborators", requireAuth, async (req, res) => {
    try {
      const ownerCheck = await isTaskOwner(req.user!.id, req.params.id);
      if (!ownerCheck) return res.status(403).json({ message: "Only task owner can add collaborators" });
      const { handle, role } = req.body;
      if (!handle) return res.status(400).json({ message: "Handle is required" });
      const validRoles = ["editor", "viewer"];
      if (role && !validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
      const user = await getUserByPublicHandle(handle);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.id === req.user!.id) return res.status(400).json({ message: "Cannot add yourself" });
      const collab = await addCollaborator(req.params.id, user.id, role || "viewer", req.user!.id);
      res.json(collab);
    } catch (error) {
      res.status(500).json({ message: "Failed to add collaborator" });
    }
  });

  app.put("/api/tasks/:id/collaborators/:userId", requireAuth, async (req, res) => {
    try {
      const ownerCheck = await isTaskOwner(req.user!.id, req.params.id);
      if (!ownerCheck) return res.status(403).json({ message: "Only task owner can change roles" });
      const { role } = req.body;
      const validRoles = ["editor", "viewer"];
      if (!validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
      const updated = await updateCollaboratorRole(req.params.id, req.params.userId, role);
      if (!updated) return res.status(404).json({ message: "Collaborator not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update collaborator" });
    }
  });

  app.delete("/api/tasks/:id/collaborators/:userId", requireAuth, async (req, res) => {
    try {
      const ownerCheck = await isTaskOwner(req.user!.id, req.params.id);
      const isSelf = req.params.userId === req.user!.id;
      if (!ownerCheck && !isSelf) return res.status(403).json({ message: "Access denied" });
      const removed = await removeCollaborator(req.params.id, req.params.userId);
      if (!removed) return res.status(404).json({ message: "Collaborator not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove collaborator" });
    }
  });
}
