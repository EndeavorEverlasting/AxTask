import { randomUUID } from "crypto";
import { db } from "../db";
import { and, desc, eq, ne } from "drizzle-orm";
import { slugifyPlaceBase } from "../lib/place-slug";
import {
  userLocationPlaces,
  userLocationEvents,
  type UserLocationPlace,
  type UserLocationEvent,
} from "@shared/schema";

export { slugifyPlaceBase } from "../lib/place-slug";

const MAX_SLUG_ALLOCATION_RETRIES = 8;

function isPostgresUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { code?: string; cause?: unknown };
  if (o.code === "23505") return true;
  if (o.cause && typeof o.cause === "object" && (o.cause as { code?: string }).code === "23505") {
    return true;
  }
  return false;
}

async function ensureUniqueSlugForUser(
  userId: string,
  base: string,
  excludePlaceId?: string,
): Promise<string> {
  let candidate = base.slice(0, 64);
  let n = 0;
  for (;;) {
    const parts = [eq(userLocationPlaces.userId, userId), eq(userLocationPlaces.slug, candidate)];
    if (excludePlaceId) parts.push(ne(userLocationPlaces.id, excludePlaceId));
    const rows = await db
      .select({ id: userLocationPlaces.id })
      .from(userLocationPlaces)
      .where(and(...parts))
      .limit(1);
    if (rows.length === 0) return candidate;
    n += 1;
    const suffix = `-${n}`;
    candidate = (base.slice(0, 64 - suffix.length) + suffix).slice(0, 64);
  }
}

export async function listUserLocationPlaces(userId: string): Promise<UserLocationPlace[]> {
  return db
    .select()
    .from(userLocationPlaces)
    .where(eq(userLocationPlaces.userId, userId))
    .orderBy(desc(userLocationPlaces.updatedAt));
}

export async function getUserDefaultHome(userId: string): Promise<UserLocationPlace | null> {
  const rows = await db
    .select()
    .from(userLocationPlaces)
    .where(
      and(eq(userLocationPlaces.userId, userId), eq(userLocationPlaces.placeType, "home"), eq(userLocationPlaces.isActive, true)),
    )
    .orderBy(desc(userLocationPlaces.isDefault), desc(userLocationPlaces.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserDefaultWork(userId: string): Promise<UserLocationPlace | null> {
  const rows = await db
    .select()
    .from(userLocationPlaces)
    .where(
      and(eq(userLocationPlaces.userId, userId), eq(userLocationPlaces.placeType, "work"), eq(userLocationPlaces.isActive, true)),
    )
    .orderBy(desc(userLocationPlaces.isDefault), desc(userLocationPlaces.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolvePlaceAlias(userId: string, alias: string): Promise<UserLocationPlace | null> {
  const normalized = alias.trim().toLowerCase();
  if (normalized === "home") return getUserDefaultHome(userId);
  if (normalized === "work") return getUserDefaultWork(userId);
  const rows = await db
    .select()
    .from(userLocationPlaces)
    .where(
      and(
        eq(userLocationPlaces.userId, userId),
        eq(userLocationPlaces.slug, normalized),
        eq(userLocationPlaces.isActive, true),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function clearDefaultFlagForType(userId: string, placeType: string, exceptId: string) {
  await db
    .update(userLocationPlaces)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(userLocationPlaces.userId, userId),
        eq(userLocationPlaces.placeType, placeType),
        ne(userLocationPlaces.id, exceptId),
      ),
    );
}

export async function createUserLocationPlace(
  input: typeof userLocationPlaces.$inferInsert,
): Promise<UserLocationPlace> {
  const id = input.id ?? randomUUID();
  const label = input.label;
  const baseSlug = slugifyPlaceBase((input.slug && input.slug.length > 0 ? input.slug : null) || label);
  const slug = await ensureUniqueSlugForUser(input.userId, baseSlug, id);
  const placeType = input.placeType ?? "custom";
  if (input.isDefault && (placeType === "home" || placeType === "work")) {
    await db
      .update(userLocationPlaces)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(userLocationPlaces.userId, input.userId), eq(userLocationPlaces.placeType, placeType)));
  }
  const values: typeof userLocationPlaces.$inferInsert = {
    id,
    userId: input.userId,
    name: input.name,
    label,
    slug,
    placeType,
    notes: input.notes ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    radiusMeters: input.radiusMeters ?? 200,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
    source: input.source ?? "manual_pin",
    geocodeAccuracyMeters: input.geocodeAccuracyMeters ?? null,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
    lastEnteredAt: input.lastEnteredAt ?? null,
    lastExitedAt: input.lastExitedAt ?? null,
  };
  let candidateSlug = slug;
  for (let attempt = 0; attempt < MAX_SLUG_ALLOCATION_RETRIES; attempt++) {
    try {
      const [row] = await db
        .insert(userLocationPlaces)
        .values({ ...values, slug: candidateSlug })
        .returning();
      if (row) return row;
    } catch (e) {
      if (!isPostgresUniqueViolation(e) || attempt === MAX_SLUG_ALLOCATION_RETRIES - 1) throw e;
      candidateSlug = await ensureUniqueSlugForUser(input.userId, baseSlug, id);
    }
  }
  throw new Error("Could not allocate a unique place slug.");
}

export async function updateUserLocationPlace(
  userId: string,
  id: string,
  patch: Partial<Pick<typeof userLocationPlaces.$inferInsert, "name" | "label" | "slug" | "placeType" | "notes" | "lat" | "lng" | "radiusMeters" | "isDefault" | "isActive" | "source" | "geocodeAccuracyMeters">>,
): Promise<UserLocationPlace | null> {
  const [existing] = await db
    .select()
    .from(userLocationPlaces)
    .where(and(eq(userLocationPlaces.id, id), eq(userLocationPlaces.userId, userId)))
    .limit(1);
  if (!existing) return null;
  const nextType = patch.placeType ?? existing.placeType;
  if (patch.isDefault === true && (nextType === "home" || nextType === "work")) {
    await clearDefaultFlagForType(userId, nextType, id);
  }
  let nextSlug = existing.slug;
  if (patch.slug != null) {
    const base = slugifyPlaceBase(patch.slug);
    nextSlug = await ensureUniqueSlugForUser(userId, base, id);
  }
  for (let attempt = 0; attempt < MAX_SLUG_ALLOCATION_RETRIES; attempt++) {
    try {
      const [row] = await db
        .update(userLocationPlaces)
        .set({
          ...patch,
          name: patch.name ?? existing.name,
          label: patch.label ?? existing.label,
          slug: nextSlug,
          updatedAt: new Date(),
        })
        .where(and(eq(userLocationPlaces.id, id), eq(userLocationPlaces.userId, userId)))
        .returning();
      return row ?? null;
    } catch (e) {
      if (!isPostgresUniqueViolation(e) || attempt === MAX_SLUG_ALLOCATION_RETRIES - 1) throw e;
      if (patch.slug == null) throw e;
      const base = slugifyPlaceBase(patch.slug);
      nextSlug = await ensureUniqueSlugForUser(userId, base, id);
    }
  }
  return null;
}

export async function deleteUserLocationPlace(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(userLocationPlaces)
    .where(and(eq(userLocationPlaces.id, id), eq(userLocationPlaces.userId, userId)))
    .returning({ id: userLocationPlaces.id });
  return rows.length > 0;
}

export async function recordLocationEvent(
  input: typeof userLocationEvents.$inferInsert,
): Promise<UserLocationEvent> {
  const [row] = await db.insert(userLocationEvents).values(input).returning();
  return row!;
}

export async function markPlaceEntered(userId: string, placeId: string, at: Date = new Date()) {
  const [row] = await db
    .update(userLocationPlaces)
    .set({ lastEnteredAt: at, lastExitedAt: null, updatedAt: new Date() })
    .where(and(eq(userLocationPlaces.id, placeId), eq(userLocationPlaces.userId, userId))!)
    .returning();
  return row ?? null;
}

export async function markPlaceExited(userId: string, placeId: string, at: Date = new Date()) {
  const [row] = await db
    .update(userLocationPlaces)
    .set({ lastExitedAt: at, updatedAt: new Date() })
    .where(and(eq(userLocationPlaces.id, placeId), eq(userLocationPlaces.userId, userId))!)
    .returning();
  return row ?? null;
}

/**
 * Legacy `POST /api/location-places` shape: { id?, name, lat?, lng?, radiusMeters? }.
 * Mirrors `name` into `label`, assigns a per-user-unique `slug` from the name, `placeType=custom`.
 */
export async function upsertUserLocationPlace(
  userId: string,
  input: { id?: string; name: string; lat?: number | null; lng?: number | null; radiusMeters?: number },
): Promise<UserLocationPlace | undefined> {
  const name = input.name.trim();
  if (!name) {
    return undefined;
  }
  const label = name;
  if (input.id) {
    const [existing] = await db
      .select()
      .from(userLocationPlaces)
      .where(and(eq(userLocationPlaces.id, input.id), eq(userLocationPlaces.userId, userId)))
      .limit(1);
    if (!existing) {
      return undefined;
    }
    const base = slugifyPlaceBase(name);
    let slug = await ensureUniqueSlugForUser(userId, base, input.id);
    for (let attempt = 0; attempt < MAX_SLUG_ALLOCATION_RETRIES; attempt++) {
      try {
        const [u] = await db
          .update(userLocationPlaces)
          .set({
            name,
            label,
            slug,
            placeType: "custom",
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            radiusMeters: input.radiusMeters ?? 200,
            isActive: true,
            source: "manual_pin",
            updatedAt: new Date(),
          })
          .where(and(eq(userLocationPlaces.id, input.id), eq(userLocationPlaces.userId, userId)))
          .returning();
        if (!u) {
          return undefined;
        }
        return u;
      } catch (e) {
        if (!isPostgresUniqueViolation(e) || attempt === MAX_SLUG_ALLOCATION_RETRIES - 1) throw e;
        slug = await ensureUniqueSlugForUser(userId, base, input.id);
      }
    }
    return undefined;
  }
  return createUserLocationPlace({
    id: randomUUID(),
    userId,
    name,
    label,
    slug: "",
    placeType: "custom",
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    radiusMeters: input.radiusMeters ?? 200,
    isDefault: false,
    isActive: true,
    source: "manual_pin",
  });
}
