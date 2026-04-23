import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { avatarSkillNodes, userAvatarSkills } from "@shared/schema";

export type ProductivityExportPrices = {
  checklistPdf: number;
  tasksSpreadsheet: number;
  taskReportPdf: number;
  taskReportXlsx: number;
  /** Paid shopping-list exports (HTML, spreadsheet, PDF) share one catalog line. */
  shoppingListExport: number;
  freeInDev: boolean;
};

export type ProductivityExportKind = keyof Omit<ProductivityExportPrices, "freeInDev">;

function parseNonNegativeInt(env: string | undefined, fallback: number): number {
  const n = parseInt(env ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Base catalog prices before avatar skill discounts (env-tunable). */
export function getBaseProductivityExportPrices(): Omit<ProductivityExportPrices, "freeInDev"> {
  return {
    checklistPdf: parseNonNegativeInt(process.env.PRODUCTIVITY_EXPORT_CHECKLIST_PDF, 12),
    tasksSpreadsheet: parseNonNegativeInt(process.env.PRODUCTIVITY_EXPORT_TASKS_SPREADSHEET, 10),
    taskReportPdf: parseNonNegativeInt(process.env.PRODUCTIVITY_EXPORT_TASK_REPORT_PDF, 8),
    taskReportXlsx: parseNonNegativeInt(process.env.PRODUCTIVITY_EXPORT_TASK_REPORT_XLSX, 8),
    shoppingListExport: parseNonNegativeInt(process.env.PRODUCTIVITY_EXPORT_SHOPPING_LIST, 8),
  };
}

export function isProductivityExportFreeInDev(): boolean {
  if (process.env.PRODUCTIVITY_EXPORT_FREE_IN_DEV === "false") return false;
  if (process.env.PRODUCTIVITY_EXPORT_FREE_IN_DEV === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/** Caps discount so effective price can stay at the 1-coin floor when not free. */
function cappedDiscount(basePrice: number, rawDiscount: number): number {
  if (basePrice <= 1) return 0;
  return Math.min(Math.max(0, rawDiscount), basePrice - 1);
}

/**
 * Total coin discount from the "export-efficiency" avatar skill (levels × effect_per_level).
 */
export async function getUserExportCoinDiscountTotal(userId: string): Promise<number> {
  const [node] = await db
    .select()
    .from(avatarSkillNodes)
    .where(eq(avatarSkillNodes.skillKey, "export-efficiency"))
    .limit(1);
  if (!node) return 0;

  const [row] = await db
    .select({ level: userAvatarSkills.level })
    .from(userAvatarSkills)
    .innerJoin(avatarSkillNodes, eq(userAvatarSkills.skillNodeId, avatarSkillNodes.id))
    .where(and(eq(userAvatarSkills.userId, userId), eq(avatarSkillNodes.skillKey, "export-efficiency")))
    .limit(1);

  const level = row?.level ?? 0;
  return level * node.effectPerLevel;
}

export async function getProductivityExportPricesForUser(userId: string): Promise<ProductivityExportPrices> {
  const base = getBaseProductivityExportPrices();
  const freeInDev = isProductivityExportFreeInDev();
  if (freeInDev) {
    return {
      checklistPdf: 0,
      tasksSpreadsheet: 0,
      taskReportPdf: 0,
      taskReportXlsx: 0,
      shoppingListExport: 0,
      freeInDev: true,
    };
  }

  const discountTotal = await getUserExportCoinDiscountTotal(userId);
  const price = (basePrice: number) =>
    Math.max(1, basePrice - cappedDiscount(basePrice, discountTotal));

  return {
    checklistPdf: price(base.checklistPdf),
    tasksSpreadsheet: price(base.tasksSpreadsheet),
    taskReportPdf: price(base.taskReportPdf),
    taskReportXlsx: price(base.taskReportXlsx),
    shoppingListExport: price(base.shoppingListExport),
    freeInDev: false,
  };
}

export function priceForKind(prices: ProductivityExportPrices, kind: ProductivityExportKind): number {
  return prices[kind];
}
