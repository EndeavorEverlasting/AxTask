import { tasks, type Task, type InsertTask, type UpdateTask, users, type User, type UpsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getTasks(userId: string): Promise<Task[]>;
  getTask(id: string, userId: string): Promise<Task | undefined>;
  createTask(task: InsertTask, userId: string): Promise<Task>;
  updateTask(task: UpdateTask, userId: string): Promise<Task | undefined>;
  deleteTask(id: string, userId: string): Promise<boolean>;
  getTasksByStatus(status: string, userId: string): Promise<Task[]>;
  getTasksByPriority(priority: string, userId: string): Promise<Task[]>;
  searchTasks(query: string, userId: string): Promise<Task[]>;
  getTaskStats(userId: string): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }>;
  getUniqueActivities(userId: string): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getTasks(userId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.userId, userId));
  }

  async getTask(id: string, userId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return task || undefined;
  }

  async createTask(insertTask: InsertTask, userId: string): Promise<Task> {
    const id = randomUUID();
    const now = new Date();
    
    const taskData = {
      ...insertTask,
      id,
      userId,
      priority: "Low",
      priorityScore: 0,
      classification: "General",
      isRepeated: false,
      createdAt: now,
      updatedAt: now,
    };

    const [task] = await db.insert(tasks).values(taskData).returning();
    return task;
  }

  async updateTask(updateTask: UpdateTask, userId: string): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updateTask, updatedAt: new Date() })
      .where(and(eq(tasks.id, updateTask.id), eq(tasks.userId, userId)))
      .returning();
    return task || undefined;
  }

  async deleteTask(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getTasksByStatus(status: string, userId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(and(eq(tasks.status, status), eq(tasks.userId, userId)));
  }

  async getTasksByPriority(priority: string, userId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(and(eq(tasks.priority, priority), eq(tasks.userId, userId)));
  }

  async searchTasks(query: string, userId: string): Promise<Task[]> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    return await db.select().from(tasks).where(
      and(
        eq(tasks.userId, userId),
        or(
          ilike(tasks.activity, lowercaseQuery),
          ilike(tasks.notes, lowercaseQuery),
          ilike(tasks.classification, lowercaseQuery)
        )
      )
    );
  }

  async getTaskStats(userId: string): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }> {
    const allTasks = await this.getTasks(userId);
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

  async getUniqueActivities(userId: string): Promise<string[]> {
    const allTasks = await this.getTasks(userId);
    const activitySet = new Set(allTasks.map(task => task.activity));
    const uniqueActivities = Array.from(activitySet);
    return uniqueActivities.sort();
  }
}

export const storage = new DatabaseStorage();