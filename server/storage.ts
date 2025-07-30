import { type Task, type InsertTask, type UpdateTask } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Task operations
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(task: UpdateTask): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;
  getTasksByStatus(status: string): Promise<Task[]>;
  getTasksByPriority(priority: string): Promise<Task[]>;
  searchTasks(query: string): Promise<Task[]>;
  
  // Analytics
  getTaskStats(): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }>;
}

export class MemStorage implements IStorage {
  private tasks: Map<string, Task>;

  constructor() {
    this.tasks = new Map();
  }

  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date();
    const task: Task = {
      ...insertTask,
      id,
      notes: insertTask.notes || null,
      urgency: insertTask.urgency || null,
      impact: insertTask.impact || null,
      effort: insertTask.effort || null,
      prerequisites: insertTask.prerequisites || null,
      priority: "Low", // Will be calculated by priority engine
      priorityScore: 0, // Will be calculated by priority engine
      classification: "General", // Will be calculated by priority engine
      isRepeated: false, // Will be calculated by priority engine
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(updateTask: UpdateTask): Promise<Task | undefined> {
    const existingTask = this.tasks.get(updateTask.id);
    if (!existingTask) return undefined;

    const updatedTask: Task = {
      ...existingTask,
      ...updateTask,
      updatedAt: new Date(),
    };
    this.tasks.set(updateTask.id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  async getTasksByPriority(priority: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => task.priority === priority);
  }

  async searchTasks(query: string): Promise<Task[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.tasks.values()).filter(task =>
      task.activity.toLowerCase().includes(lowercaseQuery) ||
      task.notes?.toLowerCase().includes(lowercaseQuery) ||
      task.classification.toLowerCase().includes(lowercaseQuery)
    );
  }

  async getTaskStats(): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }> {
    const allTasks = Array.from(this.tasks.values());
    const today = new Date().toISOString().split('T')[0];
    
    const totalTasks = allTasks.length;
    const highPriorityTasks = allTasks.filter(task => 
      task.priority === "Highest" || task.priority === "High"
    ).length;
    const completedToday = allTasks.filter(task => 
      task.status === "completed" && task.updatedAt && 
      task.updatedAt.toISOString().split('T')[0] === today
    ).length;
    const avgPriorityScore = totalTasks > 0 
      ? allTasks.reduce((sum, task) => sum + task.priorityScore, 0) / totalTasks 
      : 0;

    return {
      totalTasks,
      highPriorityTasks,
      completedToday,
      avgPriorityScore: Math.round(avgPriorityScore * 10) / 10,
    };
  }
}

export const storage = new MemStorage();
