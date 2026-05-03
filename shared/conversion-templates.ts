import type { ConversionArtifactType } from "./schema";
import { conversionArtifactItemSchema } from "./schema";
import { topoSortKeyedItems } from "./dependency-graph";
import type { z } from "zod";

export type TaskTemplateItem = {
  key: string;
  activity: string;
  notes?: string;
  classification: string;
  startOffsetDays: number;
  durationMinutes: number;
  dependsOnKeys?: string[];
  milestone?: boolean;
  deadlineType?: "flexible" | "hard" | "audit-risk" | "external" | "exam";
};

export type ConversionTemplate = {
  id: string;
  name: string;
  conversionType: ConversionArtifactType;
  items: TaskTemplateItem[];
};

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type MaterializedConversionPayload = {
  title: string;
  conversionType: ConversionArtifactType;
  originalActivity: string;
  originalNotes: string;
  items: z.infer<typeof conversionArtifactItemSchema>[];
};

/**
 * Expands a template into `POST /api/conversion-artifacts` body fields
 * (items gain ISO start/end dates; keys + dependsOnKeys stay for server resolution).
 */
export function materializeTemplate(
  template: ConversionTemplate,
  opts: { startDate: string; namePrefix?: string; examDate?: string },
): MaterializedConversionPayload {
  const prefix = opts.namePrefix?.trim() ? `${opts.namePrefix.trim()}: ` : "";
  const title = `${prefix}${template.name}`.trim();
  const examCap = "2026-07-08";
  let examYmd = opts.examDate?.trim() || "2026-06-25";
  if (examYmd > examCap) examYmd = examCap;

  const items: z.infer<typeof conversionArtifactItemSchema>[] = [];

  const sorted = topoSortKeyedItems(template.items);

  for (const it of sorted) {
    const startYmd = it.milestone && opts.examDate ? examYmd : addDaysIso(opts.startDate, it.startOffsetDays);
    const endYmd = addDaysIso(startYmd, Math.max(0, Math.ceil(it.durationMinutes / (60 * 24)) - 1));
    items.push({
      key: it.key,
      activity: it.activity,
      notes: it.notes ?? "",
      classification: it.classification,
      startDate: startYmd,
      endDate: it.milestone ? startYmd : endYmd,
      durationMinutes: it.durationMinutes,
      dependsOnKeys: it.dependsOnKeys ?? [],
      milestone: it.milestone,
      deadlineType: it.deadlineType ?? (it.milestone ? "exam" : "flexible"),
    });
  }

  return {
    title,
    conversionType: template.conversionType,
    originalActivity: title,
    originalNotes: `Generated from template ${template.id}. Exam target: ${examYmd}.`,
    items,
  };
}
