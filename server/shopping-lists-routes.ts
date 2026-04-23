import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "./auth";
import {
  getUserByEmail,
  getOrCreateWallet,
  spendCoins,
  userHasAvatarSkillUnlocked,
} from "./storage";
import { DENDRITIC_SHOPPING_LIST_SKILL_KEY } from "@shared/shopping-list-feature";
import {
  insertShoppingListItemSchema,
  inviteShoppingListMemberSchema,
  reorderShoppingListItemsSchema,
  updateShoppingListItemSchema,
  type ShoppingListItem,
} from "@shared/schema";
import { getProductivityExportPricesForUser, priceForKind } from "./productivity-export-pricing";
import {
  addShoppingListMember,
  createShoppingList,
  createShoppingListItem,
  deleteShoppingList,
  deleteShoppingListItem,
  getShoppingList,
  getShoppingListMemberRole,
  listShoppingListItems,
  listShoppingListMembers,
  listShoppingListsForUser,
  removeShoppingListMember,
  reorderShoppingListItems,
  updateShoppingListItem,
  updateShoppingListName,
} from "./shopping-lists-storage";
import {
  notifyShoppingListItemRemoved,
  notifyShoppingListItemUpsert,
  notifyShoppingListReordered,
} from "./shopping-list-ws";
import {
  buildSharedShoppingListHtmlDocument,
  buildSharedShoppingListSpreadsheetBuffer,
  generateSharedShoppingListPdf,
} from "./shopping-list-export-generators";

function serializeItem(row: ShoppingListItem) {
  return {
    ...row,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    purchasedAt: row.purchasedAt?.toISOString?.() ?? row.purchasedAt,
  };
}

const createListBodySchema = z.object({
  name: z.string().min(1).max(120),
});

const patchListBodySchema = z.object({
  name: z.string().min(1).max(120),
});

async function assertShoppingListSkillOr403(userId: string, res: Response): Promise<boolean> {
  const ok = await userHasAvatarSkillUnlocked(userId, DENDRITIC_SHOPPING_LIST_SKILL_KEY);
  if (!ok) {
    res.status(403).json({
      code: "SHOPPING_LIST_LOCKED",
      message: "Unlock Dendritic List Sense in the avatar skill tree to create shared shopping lists and exports.",
    });
    return false;
  }
  return true;
}

export function attachShoppingListRoutes(app: Express): void {
  app.get("/api/shopping-lists", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const lists = await listShoppingListsForUser(userId);
      res.json(lists);
    } catch {
      res.status(500).json({ message: "Failed to list shopping lists" });
    }
  });

  app.post("/api/shopping-lists", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      if (!(await assertShoppingListSkillOr403(userId, res))) return;
      const parsed = createListBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "name is required (1–120 chars)" });
      }
      const list = await createShoppingList(userId, parsed.data.name);
      res.status(201).json(list);
    } catch {
      res.status(500).json({ message: "Failed to create shopping list" });
    }
  });

  app.get("/api/shopping-lists/:listId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const role = await getShoppingListMemberRole(userId, listId);
      if (!role) return res.status(403).json({ message: "Access denied" });
      const list = await getShoppingList(listId);
      if (!list) return res.status(404).json({ message: "Not found" });
      res.json({ ...list, myRole: role });
    } catch {
      res.status(500).json({ message: "Failed to load shopping list" });
    }
  });

  app.patch("/api/shopping-lists/:listId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const parsed = patchListBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
      const updated = await updateShoppingListName(listId, userId, parsed.data.name);
      if (!updated) return res.status(403).json({ message: "Only the list owner can rename" });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Failed to update shopping list" });
    }
  });

  app.delete("/api/shopping-lists/:listId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const ok = await deleteShoppingList(listId, userId);
      if (!ok) return res.status(403).json({ message: "Only the list owner can delete" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete shopping list" });
    }
  });

  app.get("/api/shopping-lists/:listId/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const role = await getShoppingListMemberRole(userId, listId);
      if (!role) return res.status(403).json({ message: "Access denied" });
      const members = await listShoppingListMembers(listId);
      res.json(members);
    } catch {
      res.status(500).json({ message: "Failed to list members" });
    }
  });

  app.post("/api/shopping-lists/:listId/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const parsed = inviteShoppingListMemberSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "email and optional role required" });
      const invitee = await getUserByEmail(parsed.data.email);
      if (!invitee) return res.status(404).json({ message: "User not found" });
      const added = await addShoppingListMember(listId, userId, invitee.id, parsed.data.role);
      if (added === undefined) return res.status(403).json({ message: "Only the owner can invite members" });
      if (added === "exists") return res.status(409).json({ message: "User is already a member" });
      res.status(201).json(added);
    } catch {
      res.status(500).json({ message: "Failed to add member" });
    }
  });

  app.delete("/api/shopping-lists/:listId/members/:memberUserId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId, memberUserId } = req.params;
      const ok = await removeShoppingListMember(listId, userId, memberUserId);
      if (!ok) return res.status(403).json({ message: "Access denied" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.get("/api/shopping-lists/:listId/items", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const role = await getShoppingListMemberRole(userId, listId);
      if (!role) return res.status(403).json({ message: "Access denied" });
      const items = await listShoppingListItems(listId);
      res.json(items.map(serializeItem));
    } catch {
      res.status(500).json({ message: "Failed to list items" });
    }
  });

  app.post("/api/shopping-lists/:listId/items", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const parsed = insertShoppingListItemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid item" });
      const item = await createShoppingListItem(listId, userId, parsed.data);
      if (!item) return res.status(403).json({ message: "Access denied" });
      notifyShoppingListItemUpsert(listId, serializeItem(item) as Record<string, unknown>);
      res.status(201).json(serializeItem(item));
    } catch {
      res.status(500).json({ message: "Failed to create item" });
    }
  });

  app.post("/api/shopping-lists/:listId/items/reorder", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId } = req.params;
      const parsed = reorderShoppingListItemsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "itemIds required" });
      const ok = await reorderShoppingListItems(listId, userId, parsed.data.itemIds);
      if (!ok) return res.status(400).json({ message: "Cannot reorder (permission or invalid ids)" });
      notifyShoppingListReordered(listId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to reorder" });
    }
  });

  app.patch("/api/shopping-lists/:listId/items/:itemId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId, itemId } = req.params;
      const parsed = updateShoppingListItemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid patch" });
      const item = await updateShoppingListItem(listId, itemId, userId, parsed.data);
      if (!item) return res.status(404).json({ message: "Not found" });
      notifyShoppingListItemUpsert(listId, serializeItem(item) as Record<string, unknown>);
      res.json(serializeItem(item));
    } catch {
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  app.delete("/api/shopping-lists/:listId/items/:itemId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listId, itemId } = req.params;
      const ok = await deleteShoppingListItem(listId, itemId, userId);
      if (!ok) return res.status(404).json({ message: "Not found" });
      notifyShoppingListItemRemoved(listId, itemId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete item" });
    }
  });

  const shoppingListSpreadsheetSchema = z.object({
    format: z.enum(["csv", "xlsx"]),
  });

  async function exportSharedList(
    req: Request,
    res: Response,
    kind: "html" | "pdf" | "spreadsheet",
  ): Promise<void> {
    const userId = req.user!.id;
    const { listId } = req.params;
    if (!(await assertShoppingListSkillOr403(userId, res))) return;
    const role = await getShoppingListMemberRole(userId, listId);
    if (!role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }
    const list = await getShoppingList(listId);
    if (!list) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const items = await listShoppingListItems(listId);
    if (items.length === 0) {
      res.status(400).json({ message: "No items to export." });
      return;
    }

    const prices = await getProductivityExportPricesForUser(userId);
    const required = priceForKind(prices, "shoppingListExport");
    const spendReason =
      kind === "html"
        ? "productivity_export:shared_shopping_list_html"
        : kind === "pdf"
          ? "productivity_export:shared_shopping_list_pdf"
          : "productivity_export:shared_shopping_list_spreadsheet";
    if (!prices.freeInDev && required > 0) {
      const w = await spendCoins(userId, required, spendReason);
      if (!w) {
        const bal = await getOrCreateWallet(userId);
        res.status(402).json({
          code: "INSUFFICIENT_COINS",
          required,
          balance: bal.balance,
          message: "Not enough AxCoins for this export.",
        });
        return;
      }
    }

    const rows = items.map((i) => ({
      label: i.label,
      notes: i.notes ?? "",
      purchased: i.purchased,
    }));
    const day = new Date().toISOString().split("T")[0];
    const safeName = list.name.replace(/[^\w\-]+/g, "_").slice(0, 40) || "list";

    if (kind === "html") {
      const html = buildSharedShoppingListHtmlDocument(rows, list.name);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="axtask-shared-shopping-${safeName}-${day}.html"`,
      );
      res.send(Buffer.from(html, "utf8"));
      return;
    }
    if (kind === "pdf") {
      const pdfDoc = generateSharedShoppingListPdf(rows, list.name);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="axtask-shared-shopping-${safeName}-${day}.pdf"`,
      );
      pdfDoc.pipe(res);
      pdfDoc.end();
      return;
    }
    const parsed = shoppingListSpreadsheetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "format must be csv or xlsx" });
      return;
    }
    const buf = buildSharedShoppingListSpreadsheetBuffer(rows, parsed.data.format, list.name);
    const ext = parsed.data.format === "csv" ? "csv" : "xlsx";
    const mime =
      parsed.data.format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="axtask-shared-shopping-${safeName}-${day}.${ext}"`,
    );
    res.send(buf);
  }

  app.post("/api/shopping-lists/:listId/export/html", requireAuth, async (req, res) => {
    try {
      await exportSharedList(req, res, "html");
    } catch {
      res.status(500).json({ message: "Failed to export" });
    }
  });

  app.post("/api/shopping-lists/:listId/export/pdf", requireAuth, async (req, res) => {
    try {
      await exportSharedList(req, res, "pdf");
    } catch {
      res.status(500).json({ message: "Failed to export" });
    }
  });

  app.post("/api/shopping-lists/:listId/export/spreadsheet", requireAuth, async (req, res) => {
    try {
      await exportSharedList(req, res, "spreadsheet");
    } catch {
      res.status(500).json({ message: "Failed to export" });
    }
  });
}
