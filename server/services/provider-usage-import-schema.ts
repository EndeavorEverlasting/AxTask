import { z } from "zod";

export const neonBillingImportSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
});

export type NeonBillingImport = z.infer<typeof neonBillingImportSchema>;
