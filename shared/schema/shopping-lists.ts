// Collaborative shared shopping lists (household / team lists), separate from
// per-user `tasks`. Depends only on `users` from ./core.

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./core";

export const SHOPPING_LIST_MEMBER_ROLES = ["owner", "editor", "viewer"] as const;
export type ShoppingListMemberRole = (typeof SHOPPING_LIST_MEMBER_ROLES)[number];

export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    createdByUserId: varchar("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_shopping_lists_created_by").on(t.createdByUserId)],
);

export const shoppingListMembers = pgTable(
  "shopping_list_members",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    listId: varchar("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("editor"),
    invitedBy: varchar("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("ux_shopping_list_members_list_user").on(t.listId, t.userId),
    index("idx_shopping_list_members_user").on(t.userId),
  ],
);

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    listId: varchar("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    notes: text("notes").default(""),
    purchased: boolean("purchased").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: varchar("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purchasedByUserId: varchar("purchased_by_user_id").references(() => users.id, { onDelete: "set null" }),
    purchasedAt: timestamp("purchased_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_shopping_list_items_list_sort").on(t.listId, t.sortOrder)],
);

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type ShoppingListMember = typeof shoppingListMembers.$inferSelect;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;

export const insertShoppingListItemSchema = z.object({
  label: z.string().min(1).max(500),
  notes: z.string().max(10_000).optional().default(""),
});

export const updateShoppingListItemSchema = z.object({
  label: z.string().min(1).max(500).optional(),
  notes: z.string().max(10_000).optional(),
  purchased: z.boolean().optional(),
});

export const inviteShoppingListMemberSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["editor", "viewer"]).optional(),
  })
  .transform((d) => ({ ...d, role: d.role ?? ("editor" as const) }));

export const reorderShoppingListItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
});
