import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, updateTaskSchema } from "@shared/schema";
import { PriorityEngine } from "../client/src/lib/priority-engine";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get task by ID
  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Create new task
  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      
      // Create task first
      let task = await storage.createTask(validatedData);
      
      // Calculate priority and classification using the priority engine
      const allTasks = await storage.getTasks();
      const priorityResult = await PriorityEngine.calculatePriority(
        task.activity,
        task.notes || "",
        task.urgency,
        task.impact,
        task.effort,
        allTasks.filter(t => t.id !== task.id) // Exclude current task
      );
      
      const classification = PriorityEngine.classifyTask(task.activity, task.notes || "");
      
      // Update task with calculated values
      task = await storage.updateTask({
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
  app.put("/api/tasks/:id", async (req, res) => {
    try {
      const validatedData = updateTaskSchema.parse({
        ...req.body,
        id: req.params.id,
      });
      
      let task = await storage.updateTask(validatedData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Recalculate priority if activity or notes changed
      if (validatedData.activity || validatedData.notes) {
        const allTasks = await storage.getTasks();
        const priorityResult = await PriorityEngine.calculatePriority(
          task!.activity,
          task!.notes || "",
          task!.urgency,
          task!.impact,
          task!.effort,
          allTasks.filter(t => t.id !== task!.id)
        );
        
        const classification = PriorityEngine.classifyTask(task!.activity, task!.notes || "");
        
        task = await storage.updateTask({
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
  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Search tasks
  app.get("/api/tasks/search/:query", async (req, res) => {
    try {
      const tasks = await storage.searchTasks(req.params.query);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to search tasks" });
    }
  });

  // Get tasks by status
  app.get("/api/tasks/status/:status", async (req, res) => {
    try {
      const tasks = await storage.getTasksByStatus(req.params.status);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by status" });
    }
  });

  // Get tasks by priority
  app.get("/api/tasks/priority/:priority", async (req, res) => {
    try {
      const tasks = await storage.getTasksByPriority(req.params.priority);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks by priority" });
    }
  });

  // Get task statistics  
  app.get("/api/tasks/stats", async (req, res) => {
    try {
      const stats = await storage.getTaskStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task statistics" });
    }
  });

  // Recalculate all priorities
  app.post("/api/tasks/recalculate", async (req, res) => {
    try {
      const allTasks = await storage.getTasks();
      
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
        
        await storage.updateTask({
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

  const httpServer = createServer(app);
  return httpServer;
}
