import type { Task } from "@shared/schema";

export interface PlannerResult {
  action: string;
  answer: string;
  relatedTasks: Task[];
}

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

export function processPlannerQuery(
  text: string,
  allTasks: Task[],
  todayStr: string,
  now: Date
): PlannerResult {
  const pendingTasks = allTasks.filter(t => t.status !== "completed");
  const q = text.toLowerCase();

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

    const relatedTasks = sorted.slice(0, 5).map(s => s.task);
    const answer = relatedTasks.length === 0
      ? "You have no pending tasks right now. Great job!"
      : `Your most urgent tasks are:\n${relatedTasks.map((t, i) => `${i + 1}. ${t.activity} (${t.priority}, due ${t.date})`).join("\n")}`;

    return { action: "show_answer", answer, relatedTasks };
  }

  if (q.match(/\b(overdue|late|missed|past due)\b/)) {
    const relatedTasks = pendingTasks.filter(t => isOverdueTask(t, todayStr, now));
    const answer = relatedTasks.length === 0
      ? "No overdue tasks. You're all caught up!"
      : `You have ${relatedTasks.length} overdue task(s):\n${relatedTasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.activity} (was due ${t.date})`).join("\n")}`;
    return { action: "show_answer", answer, relatedTasks: relatedTasks.slice(0, 5) };
  }

  if (q.match(/\b(due today|today's|today)\b/)) {
    const relatedTasks = pendingTasks.filter(t => t.date === todayStr);
    const answer = relatedTasks.length === 0
      ? "You have no tasks due today."
      : `You have ${relatedTasks.length} task(s) due today:\n${relatedTasks.map((t, i) => `${i + 1}. ${t.activity}${t.time ? ` at ${t.time}` : ""}`).join("\n")}`;
    return { action: "show_answer", answer, relatedTasks: relatedTasks.slice(0, 5) };
  }

  if (q.match(/\b(summarize.*week|week.*summary|weekly)\b/)) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + (6 - now.getDay()));
    const endStr = weekEnd.toISOString().split("T")[0];
    const relatedTasks = pendingTasks.filter(t => t.date >= todayStr && t.date <= endStr);
    const answer = relatedTasks.length === 0
      ? "Your week looks clear — no tasks scheduled."
      : `You have ${relatedTasks.length} task(s) remaining this week:\n${relatedTasks.slice(0, 8).map((t, i) => `${i + 1}. ${t.activity} (${t.date})`).join("\n")}`;
    return { action: "show_answer", answer, relatedTasks: relatedTasks.slice(0, 5) };
  }

  if (q.match(/\b(summarize|summary|how.*doing|status|overview)\b/)) {
    const completed = allTasks.filter(t => t.status === "completed").length;
    const overdue = pendingTasks.filter(t => isOverdueTask(t, todayStr, now)).length;
    const dueToday = pendingTasks.filter(t => t.date === todayStr).length;
    const answer = `Here's your overview:\n• ${allTasks.length} total tasks (${completed} completed)\n• ${pendingTasks.length} pending\n• ${overdue} overdue\n• ${dueToday} due today`;
    return { action: "show_answer", answer, relatedTasks: [] };
  }

  if (q.match(/\b(this week|week|upcoming)\b/)) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + (6 - now.getDay()));
    const endStr = weekEnd.toISOString().split("T")[0];
    const relatedTasks = pendingTasks.filter(t => t.date >= todayStr && t.date <= endStr);
    const answer = relatedTasks.length === 0
      ? "No tasks due this week."
      : `You have ${relatedTasks.length} task(s) due this week:\n${relatedTasks.slice(0, 8).map((t, i) => `${i + 1}. ${t.activity} (${t.date})`).join("\n")}`;
    return { action: "show_answer", answer, relatedTasks: relatedTasks.slice(0, 5) };
  }

  if (q.match(/\b(completed|done|finished)\b/)) {
    const relatedTasks = allTasks.filter(t => t.status === "completed");
    const answer = `You've completed ${relatedTasks.length} task(s) total.`;
    return { action: "show_answer", answer, relatedTasks: relatedTasks.slice(0, 5) };
  }

  const matches = pendingTasks.filter(t =>
    t.activity.toLowerCase().includes(q) ||
    (t.notes || "").toLowerCase().includes(q)
  );

  if (matches.length > 0) {
    return {
      action: "show_answer",
      answer: `Found ${matches.length} task(s) matching "${text}":\n${matches.slice(0, 5).map((t, i) => `${i + 1}. ${t.activity} (${t.priority}, due ${t.date})`).join("\n")}`,
      relatedTasks: matches.slice(0, 5),
    };
  }

  return {
    action: "show_answer",
    answer: "I can help you with questions like:\n• \"What's most urgent?\"\n• \"What's due today?\"\n• \"Show overdue tasks\"\n• \"Summarize my week\"\n• \"What's due this week?\"",
    relatedTasks: [],
  };
}
