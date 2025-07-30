import type { Task } from "@shared/schema";

export interface PriorityResult {
  score: number;
  priority: string;
  isRepeated: boolean;
}

export class PriorityEngine {
  static async calculatePriority(
    activity: string,
    notes: string,
    urgency: number | null = null,
    impact: number | null = null,
    effort: number | null = null,
    existingTasks: Task[] = []
  ): Promise<PriorityResult> {
    const combined = (activity + " " + notes).toLowerCase();
    let score = 0;

    // Keyword classification scoring (from original script)
    const criticalKeywords = {
      "submit": 4, "deadline": 4, "urgent": 4, "license": 4, "confirm": 3,
      "install": 3, "fix": 3, "setup": 3, "configure": 3, "coord": 3,
      "meeting": 2, "call": 2, "follow": 2, "email": 2, "share": 2,
      "plan": 1, "research": 1, "review": 1, "update": 1
    };

    Object.keys(criticalKeywords).forEach(keyword => {
      if (combined.includes(keyword)) {
        score += criticalKeywords[keyword as keyof typeof criticalKeywords];
      }
    });

    // Tag detection
    if (combined.includes("@urgent") || combined.includes("#urgent")) score += 5;
    if (combined.includes("@blocker") || combined.includes("#blocker")) score += 4;
    if (combined.includes("@followup") || combined.includes("#followup")) score += 2;

    // Time sensitivity
    const timeKeywords = ["today", "tomorrow", "asap", "immediately", "now"];
    timeKeywords.forEach(keyword => {
      if (combined.includes(keyword)) score += 3;
    });

    // Date pattern detection
    if (combined.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/)) {
      score += 2;
    }

    // Problem indicators
    const problemKeywords = ["error", "issue", "problem", "broken", "failed", "won't", "can't", "doesn't"];
    problemKeywords.forEach(keyword => {
      if (combined.includes(keyword)) score += 3;
    });

    // Check for repetition using Jaccard similarity
    const isRepeated = this.isRepeatedTask(combined, existingTasks);
    if (isRepeated) {
      score -= 1;
    }

    // Manual override with Urgency × Impact
    if (urgency && impact) {
      const manualScore = (urgency * impact) / 2;
      score = Math.max(score, manualScore);
    }

    // Effort penalty (higher effort = slight priority reduction)
    if (effort && effort > 3) {
      score = score * 0.9;
    }

    return {
      score: Math.round(score * 10) / 10,
      priority: this.scoreToPriority(score),
      isRepeated
    };
  }

  static scoreToPriority(score: number): string {
    if (score >= 8) return "Highest";
    else if (score >= 6) return "High";
    else if (score >= 4) return "Medium-High";
    else if (score >= 2) return "Medium";
    return "Low";
  }

  static classifyTask(activity: string, notes: string): string {
    const combined = (activity + " " + notes).toLowerCase();
    
    if (combined.match(/\b(code|develop|deploy|build|fix|debug|test|programming|software)\b/)) return "Development";
    if (combined.match(/\b(meeting|call|discuss|present|conference|standup)\b/)) return "Meeting";
    if (combined.match(/\b(research|investigate|explore|analyze|study|learn)\b/)) return "Research";
    if (combined.match(/\b(install|setup|configure|maintain|update|upgrade)\b/)) return "Maintenance";
    if (combined.match(/\b(submit|confirm|approve|sign|document|paperwork|admin)\b/)) return "Administrative";
    
    return "General";
  }

  private static isRepeatedTask(currentTask: string, existingTasks: Task[]): boolean {
    if (existingTasks.length === 0) return false;

    // Check last 30 tasks for similarity using Jaccard similarity
    const recentTasks = existingTasks.slice(0, 30);
    let repeatCount = 0;

    for (const task of recentTasks) {
      const pastCombined = (task.activity + " " + (task.notes || "")).toLowerCase();
      if (pastCombined && this.calculateSimilarity(currentTask, pastCombined) > 0.7) {
        repeatCount++;
      }
    }

    return repeatCount > 2;
  }

  private static calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' ').filter(word => word.length > 2));
    const words2 = new Set(str2.split(' ').filter(word => word.length > 2));
    
    const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  // Real-time priority calculation for form preview
  static calculatePreviewPriority(
    activity: string,
    notes: string,
    urgency: number | null = null,
    impact: number | null = null,
    effort: number | null = null
  ): { score: number; priority: string } {
    // Simplified version for real-time preview (without repetition check)
    const combined = (activity + " " + notes).toLowerCase();
    let score = 0;

    const criticalKeywords = {
      "submit": 4, "deadline": 4, "urgent": 4, "license": 4, "confirm": 3,
      "install": 3, "fix": 3, "setup": 3, "configure": 3, "coord": 3,
      "meeting": 2, "call": 2, "follow": 2, "email": 2, "share": 2,
      "plan": 1, "research": 1, "review": 1, "update": 1
    };

    Object.keys(criticalKeywords).forEach(keyword => {
      if (combined.includes(keyword)) score += criticalKeywords[keyword as keyof typeof criticalKeywords];
    });

    if (combined.includes("@urgent") || combined.includes("#urgent")) score += 5;
    if (combined.includes("@blocker") || combined.includes("#blocker")) score += 4;
    if (combined.includes("@followup") || combined.includes("#followup")) score += 2;

    const timeKeywords = ["today", "tomorrow", "asap", "immediately", "now"];
    timeKeywords.forEach(keyword => {
      if (combined.includes(keyword)) score += 3;
    });

    if (combined.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/)) score += 2;

    const problemKeywords = ["error", "issue", "problem", "broken", "failed", "won't", "can't", "doesn't"];
    problemKeywords.forEach(keyword => {
      if (combined.includes(keyword)) score += 3;
    });

    if (urgency && impact) {
      const manualScore = (urgency * impact) / 2;
      score = Math.max(score, manualScore);
    }

    if (effort && effort > 3) {
      score = score * 0.9;
    }

    return {
      score: Math.round(score * 10) / 10,
      priority: this.scoreToPriority(score)
    };
  }
}
