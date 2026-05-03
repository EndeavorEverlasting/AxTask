/**
 * Parse `MM/DD/YYYY` (or `M/D/YYYY`, `YYYY-MM-DD`) dates out of a chat topic
 * like "NSUH - 4/11/2026".
 *
 * Keeping this separate from the sweep so it's easy to unit-test and to swap
 * in a user-provided regex later without touching the orchestrator.
 */

export interface TopicDateMatch {
  /** ISO yyyy-mm-dd (UTC-safe construction — we only store the calendar date). */
  isoDate: string;
  /** Raw date token as captured in the topic. */
  rawToken: string;
}

const MDY_RE = /(?<m>\d{1,2})[/\-](?<d>\d{1,2})[/\-](?<y>\d{2,4})/;
const ISO_RE = /(?<y>20\d{2})-(?<m>\d{2})-(?<d>\d{2})/;

function toIso(y: string, m: string, d: string): string | null {
  const year = y.length === 2 ? `20${y}` : y;
  const yi = Number(year);
  const mi = Number(m);
  const di = Number(d);
  if (!Number.isFinite(yi) || !Number.isFinite(mi) || !Number.isFinite(di)) return null;
  if (yi < 2000 || yi > 2100) return null;
  if (mi < 1 || mi > 12) return null;
  if (di < 1 || di > 31) return null;
  // Guard against 2/30 etc. by round-tripping through Date (UTC).
  const probe = new Date(Date.UTC(yi, mi - 1, di));
  if (probe.getUTCFullYear() !== yi || probe.getUTCMonth() !== mi - 1 || probe.getUTCDate() !== di) {
    return null;
  }
  return `${yi}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`;
}

export function parseTopicDate(topic: string | null | undefined): TopicDateMatch | null {
  if (!topic) return null;
  const s = topic.trim();
  if (!s) return null;

  const iso = s.match(ISO_RE);
  if (iso?.groups) {
    const got = toIso(iso.groups.y, iso.groups.m, iso.groups.d);
    if (got) return { isoDate: got, rawToken: iso[0] };
  }

  const mdy = s.match(MDY_RE);
  if (mdy?.groups) {
    const got = toIso(mdy.groups.y, mdy.groups.m, mdy.groups.d);
    if (got) return { isoDate: got, rawToken: mdy[0] };
  }

  return null;
}

/**
 * Check whether an ISO yyyy-mm-dd falls in an inclusive range.
 * Empty bounds mean "open-ended".
 */
export function isoDateInRange(iso: string, start?: string, end?: string): boolean {
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

/** Returns true when the ISO date falls on Saturday or Sunday (UTC). */
export function isWeekendIso(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}
