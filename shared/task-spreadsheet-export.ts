import type { Task } from "./schema";

/**
 * CSV export for tasks (AxTask spreadsheet compatibility).
 */
export function buildTasksCsvExport(tasks: Task[] | Array<Record<string, unknown>>): string {
  const header =
    "date,time,activity,notes,urgency,impact,effort,prerequisites,recurrence,status,priority,classification";
  const lines = tasks.map((t) => {
    const r = t as Record<string, unknown>;
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    return [
      esc(r.date),
      esc(r.time),
      esc(r.activity),
      esc(r.notes),
      esc(r.urgency),
      esc(r.impact),
      esc(r.effort),
      esc(r.prerequisites),
      esc(r.recurrence),
      esc(r.status),
      esc(r.priority),
      esc(r.classification),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}
