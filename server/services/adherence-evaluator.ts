import type { Task, AdherenceSignal } from "@shared/schema";
import { getAllUsers, getLatestLoginAt, getLatestTaskMutationAt, getOrCreateWallet, getUserAdherenceState, listRecentAdherenceInterventions, storage, createAdherenceIntervention, upsertUserAdherenceState } from "../storage";
import { getAdherenceThresholds, isAdherenceEnabled } from "./adherence-thresholds";

type EvalSource = "cron" | "login" | "manual";

type EvalResult = {
  userId: string;
  source: EvalSource;
  createdSignals: AdherenceSignal[];
};

function parseDueAt(task: Task): Date | null {
  if (!task.date) return null;
  const datePart = task.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const timePart = task.time && /^\d{2}:\d{2}$/.test(task.time.trim()) ? `${task.time.trim()}:00` : "00:00:00";
  const dt = new Date(`${datePart}T${timePart}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function hoursSince(date: Date | null | undefined, now: Date): number {
  if (!date) return Number.POSITIVE_INFINITY;
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

function daysSince(date: Date | null | undefined, now: Date): number {
  return hoursSince(date, now) / 24;
}

function signalCooldownPassed(lastAt: Date | null | undefined, now: Date, hours: number): boolean {
  return hoursSince(lastAt, now) >= hours;
}

async function maybeCreateSignal(input: {
  userId: string;
  signal: AdherenceSignal;
  now: Date;
  title: string;
  message: string;
  context: Record<string, unknown>;
  dedupeKey: string;
  lastAt: Date | null | undefined;
}): Promise<boolean> {
  const thresholds = getAdherenceThresholds();
  if (!signalCooldownPassed(input.lastAt, input.now, thresholds.signalCooldownHours)) return false;
  const created = await createAdherenceIntervention({
    userId: input.userId,
    signal: input.signal,
    title: input.title,
    message: input.message,
    context: input.context,
    dedupeKey: input.dedupeKey,
    channel: "in_app",
  });
  return Boolean(created);
}

export async function evaluateAdherenceForUser(userId: string, source: EvalSource = "manual"): Promise<EvalResult> {
  const now = new Date();
  if (!isAdherenceEnabled()) {
    return { userId, source, createdSignals: [] };
  }

  const thresholds = getAdherenceThresholds();
  const [tasks, wallet, state, latestTaskMutationAt, latestLoginAt, recentInterventions] = await Promise.all([
    storage.getTasks(userId),
    getOrCreateWallet(userId),
    getUserAdherenceState(userId),
    getLatestTaskMutationAt(userId),
    getLatestLoginAt(userId),
    listRecentAdherenceInterventions(userId, undefined, 50),
  ]);

  const createdSignals: AdherenceSignal[] = [];
  const lastActivityAt = [latestTaskMutationAt, latestLoginAt]
    .filter((v): v is Date => Boolean(v))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;

  const overdueTasks = tasks
    .filter((t) => t.status !== "completed")
    .map((t) => ({ task: t, dueAt: parseDueAt(t) }))
    .filter((entry) => Boolean(entry.dueAt) && entry.dueAt!.getTime() <= now.getTime() - thresholds.missedDueMinutes * 60 * 1000)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  if (overdueTasks.length > 0) {
    const first = overdueTasks[0]!;
    const key = `missed_due_dates:${first.task.id}:${now.toISOString().slice(0, 10)}`;
    const created = await maybeCreateSignal({
      userId,
      signal: "missed_due_dates",
      now,
      title: "Task overdue",
      message: `You have ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}. Start with "${first.task.activity}".`,
      context: {
        overdueCount: overdueTasks.length,
        firstTaskId: first.task.id,
      },
      dedupeKey: key,
      lastAt: state?.lastMissedDueAt,
    });
    if (created) createdSignals.push("missed_due_dates");
  }

  const sentIntervention = recentInterventions.find((it) =>
    it.status === "open" &&
    Boolean(it.pushSentAt) &&
    ["missed_due_dates", "reminder_ignored"].includes(it.signal) &&
    daysSince(it.pushSentAt, now) < 2,
  );
  if (sentIntervention && latestTaskMutationAt && sentIntervention.pushSentAt) {
    const noActionAfterReminder = latestTaskMutationAt.getTime() <= sentIntervention.pushSentAt.getTime();
    const reminderWindowPassed = now.getTime() - sentIntervention.pushSentAt.getTime() >= thresholds.reminderIgnoredMinutes * 60 * 1000;
    if (noActionAfterReminder && reminderWindowPassed) {
      const key = `reminder_ignored:${sentIntervention.id}`;
      const created = await maybeCreateSignal({
        userId,
        signal: "reminder_ignored",
        now,
        title: "Reminder ignored",
        message: "A reminder was sent but no task action followed. Try a 5-minute quick win now.",
        context: {
          priorInterventionId: sentIntervention.id,
          priorSignal: sentIntervention.signal,
        },
        dedupeKey: key,
        lastAt: state?.lastReminderIgnoredAt,
      });
      if (created) createdSignals.push("reminder_ignored");
    }
  }

  const completionDate = wallet.lastCompletionDate ? new Date(`${wallet.lastCompletionDate}T00:00:00`) : null;
  if (wallet.currentStreak <= 0 && completionDate && daysSince(completionDate, now) >= thresholds.streakDropDays) {
    const key = `streak_drop:${now.toISOString().slice(0, 10)}`;
    const created = await maybeCreateSignal({
      userId,
      signal: "streak_drop",
      now,
      title: "Streak dropped",
      message: "Your streak dipped. Completing one task today will restart momentum.",
      context: {
        lastCompletionDate: wallet.lastCompletionDate,
        longestStreak: wallet.longestStreak,
      },
      dedupeKey: key,
      lastAt: state?.lastStreakDropAt,
    });
    if (created) createdSignals.push("streak_drop");
  }

  if (lastActivityAt && daysSince(lastActivityAt, now) >= thresholds.noEngagementDays) {
    const key = `no_engagement:${now.toISOString().slice(0, 10)}`;
    const created = await maybeCreateSignal({
      userId,
      signal: "no_engagement",
      now,
      title: "No recent activity",
      message: "You have been inactive for a while. Open your planner and complete one quick task.",
      context: {
        lastActivityAt: lastActivityAt.toISOString(),
      },
      dedupeKey: key,
      lastAt: state?.lastNoEngagementAt,
    });
    if (created) createdSignals.push("no_engagement");
  }

  await upsertUserAdherenceState(userId, {
    lastEvaluatedAt: now,
    lastLoginAt: latestLoginAt || state?.lastLoginAt || undefined,
    lastTaskMutationAt: latestTaskMutationAt || state?.lastTaskMutationAt || undefined,
    lastMissedDueAt: createdSignals.includes("missed_due_dates") ? now : state?.lastMissedDueAt || undefined,
    lastReminderIgnoredAt: createdSignals.includes("reminder_ignored") ? now : state?.lastReminderIgnoredAt || undefined,
    lastStreakDropAt: createdSignals.includes("streak_drop") ? now : state?.lastStreakDropAt || undefined,
    lastNoEngagementAt: createdSignals.includes("no_engagement") ? now : state?.lastNoEngagementAt || undefined,
  });

  return { userId, source, createdSignals };
}

export async function evaluateAdherenceForAllUsers(source: EvalSource = "cron"): Promise<{ evaluated: number; created: number }> {
  if (!isAdherenceEnabled()) return { evaluated: 0, created: 0 };
  const users = await getAllUsers();
  let created = 0;
  for (const user of users) {
    const result = await evaluateAdherenceForUser(user.id, source);
    created += result.createdSignals.length;
  }
  return { evaluated: users.length, created };
}

