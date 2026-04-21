// End-to-end encrypted DMs and device identity keys (public material only on server).
// Depends only on `users` from ./core.

import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./core";

export const userDeviceKeys = pgTable(
  "user_device_keys",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 160 }).notNull(),
    /** Public-only SPKI (typically PEM or base64 PEM body); never store private keys. */
    publicKeySpki: text("public_key_spki").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
  },
  (t) => ({
    uxUserDevice: uniqueIndex("ux_user_device_keys_user_device").on(t.userId, t.deviceId),
  }),
);

export const dmConversations = pgTable("dm_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dmConversationMembers = pgTable(
  "dm_conversation_members",
  {
    conversationId: varchar("conversation_id")
      .notNull()
      .references(() => dmConversations.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (t) => ({
    uxConvUser: uniqueIndex("ux_dm_conversation_members_conv_user").on(t.conversationId, t.userId),
  }),
);

/** Ciphertext-only DM row; decryption is client-side (ECDH P-256 static + AES-GCM v1). */
export const dmMessages = pgTable("dm_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id")
    .notNull()
    .references(() => dmConversations.id, { onDelete: "cascade" }),
  senderUserId: varchar("sender_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recipientUserId: varchar("recipient_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Sender ECDH public key (SPKI base64) so recipient derives the same shared secret. */
  senderPubSpkiB64: text("sender_pub_spki_b64").notNull(),
  ciphertextB64: text("ciphertext_b64").notNull(),
  nonceB64: text("nonce_b64").notNull(),
  contentEncoding: varchar("content_encoding", { length: 32 }).notNull().default("e2ee_ecdh_aes_gcm_v1"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserDeviceKey = typeof userDeviceKeys.$inferSelect;
export type DmConversation = typeof dmConversations.$inferSelect;
export type DmConversationMember = typeof dmConversationMembers.$inferSelect;
export type DmMessage = typeof dmMessages.$inferSelect;
