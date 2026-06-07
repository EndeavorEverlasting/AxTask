import { z } from "zod";

/** Neon bills use exclusive periodEnd (first day of the next month). */
function isValidCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.toISOString().slice(0, 10) === value;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, { message: "Invalid calendar date" });

export const neonBillingImportSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    project: z.string().trim().optional(),
    branch: z.string().trim().optional(),
    computeHours: z.number().nonnegative(),
    computeCostCents: z.number().int().nonnegative(),
    storageGbMonth: z.number().nonnegative(),
    storageCostCents: z.number().int().nonnegative(),
    historyGb: z.number().nonnegative(),
    historyCostCents: z.number().int().nonnegative(),
    transferGb: z.number().nonnegative(),
    transferCostCents: z.number().int().nonnegative(),
  })
  .refine((data) => data.periodEnd > data.periodStart, {
    message: "periodEnd must be after periodStart (exclusive end)",
    path: ["periodEnd"],
  });

export type NeonBillingImport = z.infer<typeof neonBillingImportSchema>;
