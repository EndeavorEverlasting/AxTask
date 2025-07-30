import { tasks, type Task, type InsertTask, type UpdateTask } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(task: UpdateTask): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;
  getTasksByStatus(status: string): Promise<Task[]>;
  getTasksByPriority(priority: string): Promise<Task[]>;
  searchTasks(query: string): Promise<Task[]>;
  getTaskStats(): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getTasks(): Promise<Task[]> {
    return await db.select().from(tasks);
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date();
    
    const taskData = {
      ...insertTask,
      id,
      priority: "Low", // Will be calculated by priority engine
      priorityScore: 0, // Will be calculated by priority engine
      classification: "General", // Will be calculated by priority engine
      isRepeated: false, // Will be calculated by priority engine
      createdAt: now,
      updatedAt: now,
    };

    const [task] = await db.insert(tasks).values(taskData).returning();
    return task;
  }

  async updateTask(updateTask: UpdateTask): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updateTask, updatedAt: new Date() })
      .where(eq(tasks.id, updateTask.id))
      .returning();
    return task || undefined;
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return result.rowCount !== undefined && result.rowCount > 0;
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.status, status));
  }

  async getTasksByPriority(priority: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.priority, priority));
  }

  async searchTasks(query: string): Promise<Task[]> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    return await db.select().from(tasks).where(
      or(
        ilike(tasks.activity, lowercaseQuery),
        ilike(tasks.notes, lowercaseQuery),
        ilike(tasks.classification, lowercaseQuery)
      )
    );
  }

  async getTaskStats(): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }> {
    const allTasks = await this.getTasks();
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
      avgPriorityScore,
    };
  }
}

export const storage = new DatabaseStorage();