/**
 * User-level archetype continuum ("c vector"): five nonnegative weights summing
 * to 1.0 (stored as integers summing to SUM_MILLI). Updated with a small EMA
 * nudge toward the archetype implied by feedback signals and completed missions.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { userArchetypeContinuum, type UserArchetypeContinuum } from "@shared/schema";
import { ARCHETYPE_KEYS, type ArchetypeKey } from "@shared/avatar-archetypes";
import type { ArchetypeContinuumDto } from "@shared/archetype-continuum-dto";
import type { ArchetypeSignalKind } from "./archetype-signal";
import { ARCHETYPE_CONTINUUM_SUM_MILLI, emaTowardArchetype as emaTowardArchetypeMath } from "./archetype-continuum-math";

export { ARCHETYPE_CONTINUUM_SUM_MILLI } from "./archetype-continuum-math";

const DEFAULT_EACH = ARCHETYPE_CONTINUUM_SUM_MILLI / ARCHETYPE_KEYS.length;

const ARCHETYPE_TO_INDEX: Record<ArchetypeKey, number> = {
  momentum: 0,
  strategy: 1,
  execution: 2,
  collaboration: 3,
  recovery: 4,
};

function rowToVector(row: UserArchetypeContinuum): number[] {
  return [
    row.milliMomentum,
    row.milliStrategy,
    row.milliExecution,
    row.milliCollaboration,
    row.milliRecovery,
  ];
}

function vectorToRow(userId: string, v: number[]): Omit<UserArchetypeContinuum, "userId"> & { userId: string } {
  return {
    userId,
    milliMomentum: v[0]!,
    milliStrategy: v[1]!,
    milliExecution: v[2]!,
    milliCollaboration: v[3]!,
    milliRecovery: v[4]!,
    updatedAt: new Date(),
  };
}

function alphaForSignal(signal: ArchetypeSignalKind): number {
  switch (signal) {
    case "nudge_shown":
      return 0.012;
    case "nudge_opened":
      return 0.02;
    case "feedback_submitted":
      return 0.035;
    case "nudge_dismissed":
      return 0.004;
    default:
      return 0.01;
  }
}

export async function getOrCreateUserArchetypeContinuum(userId: string): Promise<UserArchetypeContinuum> {
  const [existing] = await db.select().from(userArchetypeContinuum).where(eq(userArchetypeContinuum.userId, userId));
  if (existing) return existing;
  await db.insert(userArchetypeContinuum).values({
    userId,
    milliMomentum: DEFAULT_EACH,
    milliStrategy: DEFAULT_EACH,
    milliExecution: DEFAULT_EACH,
    milliCollaboration: DEFAULT_EACH,
    milliRecovery: DEFAULT_EACH,
    updatedAt: new Date(),
  });
  const [row] = await db.select().from(userArchetypeContinuum).where(eq(userArchetypeContinuum.userId, userId));
  if (!row) throw new Error("Failed to create user_archetype_continuum row");
  return row;
}

/**
 * Nudge continuum toward `archetypeKey` (EMA). Safe to call from hot paths;
 * logs and returns on failure without throwing.
 */
export async function bumpUserArchetypeContinuumFromArchetype(
  userId: string,
  archetypeKey: ArchetypeKey,
  alpha: number,
): Promise<void> {
  try {
    const idx = ARCHETYPE_TO_INDEX[archetypeKey];
    const row = await getOrCreateUserArchetypeContinuum(userId);
    const next = emaTowardArchetypeMath(rowToVector(row), idx, alpha, ARCHETYPE_CONTINUUM_SUM_MILLI);
    const v = vectorToRow(userId, next);
    await db
      .update(userArchetypeContinuum)
      .set({
        milliMomentum: v.milliMomentum,
        milliStrategy: v.milliStrategy,
        milliExecution: v.milliExecution,
        milliCollaboration: v.milliCollaboration,
        milliRecovery: v.milliRecovery,
        updatedAt: v.updatedAt,
      })
      .where(eq(userArchetypeContinuum.userId, userId));
  } catch (e) {
    console.error("bumpUserArchetypeContinuumFromArchetype:", e);
  }
}

export async function bumpUserArchetypeContinuumFromSignal(
  userId: string,
  archetypeKey: ArchetypeKey,
  signal: ArchetypeSignalKind,
): Promise<void> {
  await bumpUserArchetypeContinuumFromArchetype(userId, archetypeKey, alphaForSignal(signal));
}

export function toPublicArchetypeContinuum(row: UserArchetypeContinuum): ArchetypeContinuumDto {
  const v = rowToVector(row);
  const milli: Record<ArchetypeKey, number> = {
    momentum: v[0]!,
    strategy: v[1]!,
    execution: v[2]!,
    collaboration: v[3]!,
    recovery: v[4]!,
  };
  const weights = {} as Record<ArchetypeKey, number>;
  for (const k of ARCHETYPE_KEYS) {
    weights[k] = milli[k] / ARCHETYPE_CONTINUUM_SUM_MILLI;
  }
  let best: ArchetypeKey = "momentum";
  let bestVal = -1;
  for (const k of ARCHETYPE_KEYS) {
    if (milli[k] > bestVal) {
      bestVal = milli[k];
      best = k;
    }
  }
  return { milli, weights, dominantArchetype: best };
}

export async function getPublicArchetypeContinuumForUser(userId: string): Promise<ArchetypeContinuumDto> {
  const row = await getOrCreateUserArchetypeContinuum(userId);
  return toPublicArchetypeContinuum(row);
}
