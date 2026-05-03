/**
 * Normalize a Teams presence snapshot produced by the browser sweep (or a
 * future native tool) into `TeamsPresenceRow[]` that the reconciliation
 * engine can consume.
 *
 * The browser emits raw Microsoft Graph display names; `canonicalizePerson`
 * is the single source of truth for mapping those to canonical roster names,
 * so we run the mapping server-side rather than trusting the client.
 *
 * Input schema (loose — we validate per field):
 *   {
 *     generated_at?: string,
 *     topic_pattern?: string,
 *     tool_version?: string,
 *     rows?: Array<{
 *       work_date: string | Date,
 *       display_name?: string,
 *       raw_display_name?: string,
 *       canonical_name?: string,
 *       chat_topic?: string,
 *       chat_id?: string,
 *     }>
 *   }
 */
import type {
  TeamsPresenceRow,
  TeamsPresenceSnapshot,
} from "./types";
import { canonicalizePerson, normalizeDate } from "./utils";

export interface NormalizedTeamsSnapshot {
  rows: TeamsPresenceRow[];
  unmapped_display_names: string[];   // raw names that collapsed to empty canonical (or same as raw — still worth review)
  skipped: Array<{ reason: string; raw: unknown }>;
  generated_at?: string;
  topic_pattern?: string;
  tool_version?: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function normalizeTeamsSnapshot(raw: unknown): NormalizedTeamsSnapshot {
  const out: NormalizedTeamsSnapshot = {
    rows: [],
    unmapped_display_names: [],
    skipped: [],
  };
  if (!raw || typeof raw !== "object") {
    out.skipped.push({ reason: "snapshot_not_object", raw });
    return out;
  }
  const snap = raw as Partial<TeamsPresenceSnapshot> & { rows?: unknown };
  out.generated_at = typeof snap.generated_at === "string" ? snap.generated_at : undefined;
  out.topic_pattern = typeof snap.topic_pattern === "string" ? snap.topic_pattern : undefined;
  out.tool_version = typeof snap.tool_version === "string" ? snap.tool_version : undefined;

  const rows = Array.isArray(snap.rows) ? snap.rows : [];
  const unmappedSet = new Set<string>();

  for (const item of rows) {
    if (!item || typeof item !== "object") {
      out.skipped.push({ reason: "row_not_object", raw: item });
      continue;
    }
    const row = item as unknown as Record<string, unknown>;

    const workDate = normalizeDate(row.work_date);
    if (!workDate) {
      out.skipped.push({ reason: "invalid_work_date", raw: item });
      continue;
    }

    const rawDisplay = asString(row.display_name ?? row.raw_display_name).trim();
    const preCanonical = asString(row.canonical_name).trim();

    const canonical = preCanonical
      ? canonicalizePerson(preCanonical)
      : canonicalizePerson(rawDisplay);

    if (!canonical) {
      out.skipped.push({ reason: "empty_canonical_name", raw: item });
      if (rawDisplay) unmappedSet.add(rawDisplay);
      continue;
    }

    // Heuristic for "likely unmapped": canonical equals raw display (alias
    // table did not substitute anything) AND display looks like "Last, First".
    if (rawDisplay && canonical === rawDisplay && /,\s*/.test(rawDisplay)) {
      unmappedSet.add(rawDisplay);
    }

    out.rows.push({
      work_date: workDate,
      canonical_name: canonical,
      raw_display_name: rawDisplay || undefined,
      chat_topic: asString(row.chat_topic),
      chat_id: asString(row.chat_id) || undefined,
      evidence_source: "teams_deployment_chat",
    });
  }

  out.unmapped_display_names = [...unmappedSet].sort();
  return out;
}
