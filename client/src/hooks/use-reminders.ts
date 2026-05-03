import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type ReminderSummaryItem = {
  source: "task_reminder" | "ops_reminder";
  id: string;
  taskId?: string | null;
  title: string;
  body?: string | null;
  nextRunAt?: string | null;
  remindAt?: string | null;
  triggerType?: string | null;
  recurrenceRule?: string | null;
  status?: string;
  enabled?: boolean;
  createdAt?: string | null;
};

export function useRemindersSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["/api/reminders/summary"],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/reminders/summary");
      return r.json() as Promise<{ reminders: ReminderSummaryItem[] }>;
    },
  });
}
