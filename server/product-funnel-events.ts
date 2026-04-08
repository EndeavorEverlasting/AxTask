import { z } from "zod";
import { PRODUCT_FUNNEL_CLIENT_EVENTS } from "@shared/product-funnel-events";

/** Server-emitted funnel events (also listed in docs/PRODUCT_ROADMAP.md). */
export const PRODUCT_FUNNEL_SERVER_EVENTS = [
  "task_created",
  "task_completed",
  "spreadsheet_import_batch",
  "user_backup_import",
  "community_task_published",
  "voice_dispatch",
] as const;

export type ProductFunnelServerEvent = (typeof PRODUCT_FUNNEL_SERVER_EVENTS)[number];

export const productFunnelClientPostSchema = z.object({
  event: z.enum(PRODUCT_FUNNEL_CLIENT_EVENTS),
  meta: z.record(z.unknown()).optional(),
});
