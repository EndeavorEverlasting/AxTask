import type { Task } from "@shared/schema";

/**
 * AI-driven task management modules.
 * These modules use heuristic intelligence to analyze tasks and
 * provide smart ordering, scheduling, and behavior recommendations.
 *
 * **Task list "AI Sort"** (`suggestOptimalOrder`) runs entirely on the client; it does not call a remote model.
 * The task list applies the resulting order by PATCHing `/api/tasks/reorder`, which persists `sort_order` (same as drag-and-drop).
 */

export interface AIScheduleSuggestion {
  taskId: string;
  suggestedDate: string;
  reason: string;
  confidence: number; // 0-1
}

export interface AIOrderSuggestion {
  taskId: string;
  suggestedPosition: number;
  reason: string;
}

export interface CalendarInsight {
  date: string;
  type: "overloaded" | "light" | "deadline" | "optimal-slot";
  message: string;
  severity: "info" | "warning" | "critical";
}

export class TaskAIEngine {
  // ── Optimal ordering ──────────────────────────────────────────
  /**
   * AI-driven sort: ranks tasks by a composite score that weighs
   * priority, urgency keywords, deadline proximity, status, and effort.
   * Persisted order is updated separately by the caller via task reorder (see task-list AI Sort).
   */
  static suggestOptimalOrder(tasks: Task[]): Task[] {
    const scored = tasks.map((task) => ({
      task,
      score: this.computeOrderScore(task),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.task);
  }

  private static computeOrderScore(task: Task): number {
    let score = task.priorityScore / 10; // base from priority engine

    // Penalise completed tasks heavily
    if (task.status === "completed") score -= 50;
    if (task.status === "in-progress") score += 5;

    // Deadline proximity bonus
    const daysUntil = this.daysUntilDate(task.date);
    if (daysUntil !== null) {
      if (daysUntil < 0) score += 8;       // overdue
      else if (daysUntil === 0) score += 6; // today
      else if (daysUntil <= 2) score += 4;  // next 2 days
      else if (daysUntil <= 7) score += 2;  // this week
    }

    // Content urgency signals
    const text = (task.activity + " " + (task.notes || "")).toLowerCase();
    if (text.includes("blocker") || text.includes("blocked")) score += 5;
    if (text.includes("urgent") || text.includes("asap")) score += 4;
    if (text.includes("deadline") || text.includes("due")) score += 3;

    // Low-effort quick wins bubble up slightly
    if (task.effort && task.effort <= 2) score += 1.5;

    return score;
  }

  // ── Calendar scheduling suggestions ───────────────────────────
  /**
   * For unscheduled or future tasks, suggest optimal dates.
   */
  static suggestSchedule(tasks: Task[]): AIScheduleSuggestion[] {
    const suggestions: AIScheduleSuggestion[] = [];
    const dateLoad = this.computeDateLoad(tasks);
    const today = new Date();

    for (const task of tasks) {
      if (task.status === "completed") continue;

      const daysUntil = this.daysUntilDate(task.date);
      // If a task is overdue, suggest rescheduling
      if (daysUntil !== null && daysUntil < 0) {
        const bestDate = this.findLightDate(dateLoad, today, 7);
        suggestions.push({
          taskId: task.id,
          suggestedDate: bestDate,
          reason: "This task is overdue — moved to the lightest upcoming day.",
          confidence: 0.85,
        });
      }
    }

    return suggestions;
  }

  // ── Calendar insights ─────────────────────────────────────────
  /**
   * Analyse a date range and return AI insights for the calendar view.
   */
  static getCalendarInsights(tasks: Task[], startDate: Date, endDate: Date): CalendarInsight[] {
    const insights: CalendarInsight[] = [];
    const dateLoad = this.computeDateLoad(tasks);

    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const key = this.formatDate(cursor);
      const count = dateLoad[key] || 0;

      if (count >= 5) {
        insights.push({
          date: key,
          type: "overloaded",
          message: `${count} tasks scheduled — consider redistributing.`,
          severity: "critical",
        });
      } else if (count === 0) {
        insights.push({
          date: key,
          type: "optimal-slot",
          message: "Open slot — good day to schedule more work.",
          severity: "info",
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return insights;
  }

  // ── Smart reschedule on drag ──────────────────────────────────
  /**
   * When a user drags a task to a new calendar date, AI validates the move
   * and returns warnings if the target date is overloaded.
   */
  static validateCalendarMove(
    tasks: Task[],
    taskId: string,
    targetDate: string
  ): { allowed: boolean; warning?: string } {
    const dateLoad = this.computeDateLoad(tasks.filter((t) => t.id !== taskId));
    const count = dateLoad[targetDate] || 0;

    if (count >= 6) {
      return {
        allowed: true,
        warning: `That day already has ${count} tasks. Consider a lighter day.`,
      };
    }
    return { allowed: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private static daysUntilDate(dateStr: string): number | null {
    try {
      const target = new Date(dateStr);
      if (isNaN(target.getTime())) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  private static computeDateLoad(tasks: Task[]): Record<string, number> {
    const load: Record<string, number> = {};
    for (const t of tasks) {
      if (t.status === "completed") continue;
      const key = t.date;
      load[key] = (load[key] || 0) + 1;
    }
    return load;
  }

  private static findLightDate(
    dateLoad: Record<string, number>,
    startFrom: Date,
    daysAhead: number
  ): string {
    let bestDate = this.formatDate(startFrom);
    let bestCount = Infinity;

    const cursor = new Date(startFrom);
    for (let i = 0; i < daysAhead; i++) {
      // Skip weekends
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        const key = this.formatDate(cursor);
        const count = dateLoad[key] || 0;
        if (count < bestCount) {
          bestCount = count;
          bestDate = key;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return bestDate;
  }

  private static formatDate(d: Date): string {
    return d.toISOString().split("T")[0];
  }
}

