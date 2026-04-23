import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "./db";
import {
  shoppingListItems,
  shoppingListMembers,
  shoppingLists,
  users,
  type ShoppingList,
  type ShoppingListItem,
  type ShoppingListMember,
  type ShoppingListMemberRole,
} from "@shared/schema";

export type { ShoppingListMemberRole };

export async function getShoppingListMemberRole(
  userId: string,
  listId: string,
): Promise<ShoppingListMemberRole | null> {
  const [row] = await db
    .select({ role: shoppingListMembers.role })
    .from(shoppingListMembers)
    .where(and(eq(shoppingListMembers.listId, listId), eq(shoppingListMembers.userId, userId)));
  if (!row?.role) return null;
  const r = row.role as ShoppingListMemberRole;
  if (r === "owner" || r === "editor" || r === "viewer") return r;
  return null;
}

export function shoppingListRoleCanEdit(role: ShoppingListMemberRole | null): boolean {
  return role === "owner" || role === "editor";
}

export function shoppingListRoleIsOwner(role: ShoppingListMemberRole | null): boolean {
  return role === "owner";
}

export async function listShoppingListsForUser(userId: string): Promise<ShoppingList[]> {
  const listIds = await db
    .select({ listId: shoppingListMembers.listId })
    .from(shoppingListMembers)
    .where(eq(shoppingListMembers.userId, userId));
  if (listIds.length === 0) return [];
  const ids = [...new Set(listIds.map((r) => r.listId))];
  return db
    .select()
    .from(shoppingLists)
    .where(inArray(shoppingLists.id, ids))
    .orderBy(desc(shoppingLists.updatedAt));
}

export async function getShoppingList(listId: string): Promise<ShoppingList | undefined> {
  const [row] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, listId));
  return row;
}

export async function createShoppingList(userId: string, name: string): Promise<ShoppingList> {
  const id = randomUUID();
  const now = new Date();
  const [list] = await db
    .insert(shoppingLists)
    .values({
      id,
      name: name.trim(),
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(shoppingListMembers).values({
    id: randomUUID(),
    listId: list!.id,
    userId,
    role: "owner",
    invitedBy: null,
    invitedAt: now,
  });
  return list!;
}

export async function updateShoppingListName(
  listId: string,
  userId: string,
  name: string,
): Promise<ShoppingList | undefined> {
  const role = await getShoppingListMemberRole(userId, listId);
  if (!shoppingListRoleIsOwner(role)) return undefined;
  const [row] = await db
    .update(shoppingLists)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(shoppingLists.id, listId))
    .returning();
  return row;
}

export async function deleteShoppingList(listId: string, userId: string): Promise<boolean> {
  const role = await getShoppingListMemberRole(userId, listId);
  if (!shoppingListRoleIsOwner(role)) return false;
  const r = await db.delete(shoppingLists).where(eq(shoppingLists.id, listId));
  return (r.rowCount ?? 0) > 0;
}

export async function listShoppingListMembers(
  listId: string,
): Promise<(ShoppingListMember & { email: string; displayName: string | null })[]> {
  return db
    .select({
      id: shoppingListMembers.id,
      listId: shoppingListMembers.listId,
      userId: shoppingListMembers.userId,
      role: shoppingListMembers.role,
      invitedBy: shoppingListMembers.invitedBy,
      invitedAt: shoppingListMembers.invitedAt,
      email: users.email,
      displayName: users.displayName,
    })
    .from(shoppingListMembers)
    .innerJoin(users, eq(shoppingListMembers.userId, users.id))
    .where(eq(shoppingListMembers.listId, listId))
    .orderBy(asc(users.email));
}

export async function addShoppingListMember(
  listId: string,
  actorUserId: string,
  newUserId: string,
  role: "editor" | "viewer",
): Promise<ShoppingListMember | "exists" | undefined> {
  const actorRole = await getShoppingListMemberRole(actorUserId, listId);
  if (!shoppingListRoleIsOwner(actorRole)) return undefined;
  if (newUserId === actorUserId) return undefined;
  const existing = await getShoppingListMemberRole(newUserId, listId);
  if (existing) return "exists";
  const now = new Date();
  const [row] = await db
    .insert(shoppingListMembers)
    .values({
      id: randomUUID(),
      listId,
      userId: newUserId,
      role,
      invitedBy: actorUserId,
      invitedAt: now,
    })
    .returning();
  await db.update(shoppingLists).set({ updatedAt: now }).where(eq(shoppingLists.id, listId));
  return row;
}

export async function removeShoppingListMember(
  listId: string,
  actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const actorRole = await getShoppingListMemberRole(actorUserId, listId);
  const targetRole = await getShoppingListMemberRole(targetUserId, listId);
  if (!targetRole) return false;
  if (targetUserId === actorUserId) {
    if (targetRole === "owner") return false;
    await db
      .delete(shoppingListMembers)
      .where(and(eq(shoppingListMembers.listId, listId), eq(shoppingListMembers.userId, targetUserId)));
    return true;
  }
  if (!shoppingListRoleIsOwner(actorRole)) return false;
  if (targetRole === "owner") return false;
  const r = await db
    .delete(shoppingListMembers)
    .where(and(eq(shoppingListMembers.listId, listId), eq(shoppingListMembers.userId, targetUserId)));
  return (r.rowCount ?? 0) > 0;
}

export async function listShoppingListItems(listId: string): Promise<ShoppingListItem[]> {
  return db
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId))
    .orderBy(asc(shoppingListItems.sortOrder), asc(shoppingListItems.createdAt));
}

export async function createShoppingListItem(
  listId: string,
  userId: string,
  input: { label: string; notes?: string },
): Promise<ShoppingListItem | undefined> {
  const role = await getShoppingListMemberRole(userId, listId);
  if (!shoppingListRoleCanEdit(role)) return undefined;
  const [maxRow] = await db
    .select({ m: max(shoppingListItems.sortOrder) })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId));
  const nextOrder = Number(maxRow?.m ?? -1) + 1;
  const now = new Date();
  const [item] = await db
    .insert(shoppingListItems)
    .values({
      id: randomUUID(),
      listId,
      label: input.label.trim(),
      notes: (input.notes ?? "").trim(),
      purchased: false,
      sortOrder: nextOrder,
      createdByUserId: userId,
      purchasedByUserId: null,
      purchasedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.update(shoppingLists).set({ updatedAt: now }).where(eq(shoppingLists.id, listId));
  return item;
}

export async function updateShoppingListItem(
  listId: string,
  itemId: string,
  userId: string,
  patch: { label?: string; notes?: string; purchased?: boolean },
): Promise<ShoppingListItem | undefined> {
  const role = await getShoppingListMemberRole(userId, listId);
  if (!shoppingListRoleCanEdit(role)) return undefined;
  const [existing] = await db
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)));
  if (!existing) return undefined;
  const now = new Date();
  let purchasedByUserId: string | null | undefined = existing.purchasedByUserId;
  let purchasedAt: Date | null | undefined = existing.purchasedAt;
  if (patch.purchased !== undefined) {
    if (patch.purchased) {
      purchasedByUserId = userId;
      purchasedAt = now;
    } else {
      purchasedByUserId = null;
      purchasedAt = null;
    }
  }
  const [row] = await db
    .update(shoppingListItems)
    .set({
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.trim() } : {}),
      ...(patch.purchased !== undefined ? { purchased: patch.purchased } : {}),
      ...(patch.purchased !== undefined ? { purchasedByUserId, purchasedAt } : {}),
      updatedAt: now,
    })
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)))
    .returning();
  await db.update(shoppingLists).set({ updatedAt: now }).where(eq(shoppingLists.id, listId));
  return row;
}

export async function deleteShoppingListItem(
  listId: string,
  itemId: string,
  userId: string,
): Promise<boolean> {
  const role = await getShoppingListMemberRole(userId, listId);
  if (!shoppingListRoleCanEdit(role)) return false;
  const r = await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, listId)));
  if ((r.rowCount ?? 0) > 0) {
    await db.update(shoppingLists).set({ updatedAt: new Date() }).where(eq(shoppingLists.id, listId));
  }
  return (r.rowCount ?? 0) > 0;
}

export async function reorderShoppingListItems(
  listId: string,
  userId: string,
  itemIds: string[],
): Promise<boolean> {
  const role = await getShoppingListMemberRole(userId, listId);
  if (!shoppingListRoleCanEdit(role)) return false;
  const current = await listShoppingListItems(listId);
  const setIds = new Set(current.map((i) => i.id));
  if (itemIds.length !== setIds.size || itemIds.some((id) => !setIds.has(id))) return false;
  const now = new Date();
  for (let i = 0; i < itemIds.length; i++) {
    await db
      .update(shoppingListItems)
      .set({ sortOrder: i, updatedAt: now })
      .where(and(eq(shoppingListItems.id, itemIds[i]!), eq(shoppingListItems.listId, listId)));
  }
  await db.update(shoppingLists).set({ updatedAt: now }).where(eq(shoppingLists.id, listId));
  return true;
}
