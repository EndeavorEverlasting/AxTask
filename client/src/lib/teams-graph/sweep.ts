/**
 * Teams deployment-chat sweep orchestrator.
 *
 * Walks `GET /me/chats` with paging, matches each chat's `topic` against a
 * date regex (default: MM/DD/YYYY or ISO), fetches members for matches, and
 * emits a `TeamsPresenceSnapshot`-shaped object.
 *
 * Control:
 *   - `AbortSignal` stops in-flight fetches AND ends the sweep.
 *   - `onProgress` is called after each page and after each processed chat.
 *   - Filters (`topicAllowlist`, `weekendOnly`, date window) run in-memory
 *     after the topic date parse — no server-side OData filters so we stay
 *     within the least-privileged `Chat.ReadBasic` scope.
 *
 * Privacy:
 *   - We never store or log the bearer token here; callers pass a resolver
 *     so MSAL can refresh silently and tokens are short-lived.
 *   - We do NOT fetch chat messages — only topic + members.
 */

import { parseTopicDate, isoDateInRange, isWeekendIso } from "./topic-parser";

// ── Graph response shapes (subset we actually read) ────────────────────────

interface GraphChat {
  id: string;
  topic?: string | null;
  chatType?: string;
  lastUpdatedDateTime?: string;
}

interface GraphMember {
  id?: string;
  displayName?: string | null;
  email?: string | null;
  userId?: string | null;
}

interface GraphPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

// ── Public types ───────────────────────────────────────────────────────────

export interface SweepFilters {
  /** Regex applied to topic after initial date parse (optional extra gate). */
  topicAllowlistRegex?: RegExp;
  /** Regex applied to topic to reject matches (e.g. avoid test chats). */
  topicDenylistRegex?: RegExp;
  /** ISO yyyy-mm-dd lower bound, inclusive. */
  dateFrom?: string;
  /** ISO yyyy-mm-dd upper bound, inclusive. */
  dateTo?: string;
  /** If true, drop Monday–Friday dates. */
  weekendOnly?: boolean;
}

export interface SweepProgress {
  totalSeen: number;
  matched: number;
  errors: number;
  currentPage: number;
  currentChatTopic?: string;
  phase: "listing" | "fetching_members" | "done";
}

export interface SweepResultMember {
  display_name: string;
  user_id?: string;
  email?: string;
}

export interface SweepResultChat {
  chat_id: string;
  topic: string;
  work_date: string;          // ISO yyyy-mm-dd parsed from topic
  members: SweepResultMember[];
  error?: string;             // set if member fetch failed; members will be []
}

export interface SweepResult {
  /** Normalized per-chat matches (snapshot-ready after expansion). */
  chats: SweepResultChat[];
  /** Human-readable log lines (mistake catching). */
  diagnostics: string[];
  /** Topics examined but rejected — useful for tuning the regex. */
  rejected_topics: string[];
}

export interface SnapshotRow {
  work_date: string;
  display_name: string;
  chat_topic: string;
  chat_id: string;
}

export interface TeamsSweepSnapshot {
  generated_at: string;
  topic_pattern: string;
  tool_version: string;
  filters: {
    date_from?: string;
    date_to?: string;
    weekend_only?: boolean;
    topic_allowlist?: string;
    topic_denylist?: string;
  };
  rows: SnapshotRow[];
}

export interface RunSweepOptions {
  /** Resolves a fresh bearer token (MSAL acquireTokenSilent/Popup). */
  getAccessToken: () => Promise<string>;
  filters?: SweepFilters;
  onProgress?: (p: SweepProgress) => void;
  signal?: AbortSignal;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Graph base URL (override for tests). */
  graphBase?: string;
  /** Max chats to fetch (safety cap; 0 = unlimited). */
  maxChats?: number;
}

// ── Implementation ─────────────────────────────────────────────────────────

const SWEEP_TOOL_VERSION = "browser-sweep-0.1.0";

/** Fetch with bearer token + abort + a single 401 refresh attempt. */
async function graphGet<T>(
  url: string,
  opts: RunSweepOptions,
  attempt = 0,
): Promise<T> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const token = await opts.getAccessToken();
  const res = await fetchFn(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: opts.signal,
  });
  if (res.status === 401 && attempt === 0) {
    // Single retry — MSAL may return a stale token; caller's getAccessToken
    // should be configured to refresh on next call.
    return graphGet<T>(url, opts, 1);
  }
  if (res.status === 429) {
    // Honor Retry-After (seconds) when present, fall back to a small backoff.
    const ra = Number(res.headers.get("Retry-After"));
    const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000;
    await delay(waitMs, opts.signal);
    if (attempt < 3) return graphGet<T>(url, opts, attempt + 1);
  }
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`Graph ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function matchChat(
  topic: string | null | undefined,
  filters: SweepFilters | undefined,
): { isoDate: string } | null {
  const parsed = parseTopicDate(topic ?? "");
  if (!parsed) return null;
  if (filters?.topicAllowlistRegex && !filters.topicAllowlistRegex.test(topic ?? "")) return null;
  if (filters?.topicDenylistRegex && filters.topicDenylistRegex.test(topic ?? "")) return null;
  if (!isoDateInRange(parsed.isoDate, filters?.dateFrom, filters?.dateTo)) return null;
  if (filters?.weekendOnly && !isWeekendIso(parsed.isoDate)) return null;
  return { isoDate: parsed.isoDate };
}

export async function runSweep(opts: RunSweepOptions): Promise<SweepResult> {
  const graphBase = opts.graphBase ?? "https://graph.microsoft.com/v1.0";
  const filters = opts.filters;
  const onProgress = opts.onProgress ?? (() => { /* noop */ });
  const maxChats = opts.maxChats ?? 0;

  const chats: SweepResultChat[] = [];
  const diagnostics: string[] = [];
  const rejected: string[] = [];

  let totalSeen = 0;
  let matched = 0;
  let errors = 0;
  let page = 0;

  // `$top` + `$select` keeps payloads small and avoids pulling message bodies.
  let nextUrl: string | undefined =
    `${graphBase}/me/chats?$select=id,topic,chatType,lastUpdatedDateTime&$top=50`;

  try {
    while (nextUrl) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      page += 1;
      onProgress({ totalSeen, matched, errors, currentPage: page, phase: "listing" });
      const currentUrl: string = nextUrl;
      const resp: GraphPage<GraphChat> = await graphGet<GraphPage<GraphChat>>(currentUrl, opts);

      for (const chat of resp.value) {
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        totalSeen += 1;
        if (maxChats > 0 && totalSeen > maxChats) {
          diagnostics.push(`[safety] maxChats reached (${maxChats}); stopping sweep.`);
          nextUrl = undefined;
          break;
        }
        const topic = chat.topic ?? "";
        const hit = matchChat(topic, filters);
        if (!hit) {
          if (topic) rejected.push(topic);
          continue;
        }

        onProgress({
          totalSeen,
          matched,
          errors,
          currentPage: page,
          currentChatTopic: topic,
          phase: "fetching_members",
        });

        try {
          const membersUrl =
            `${graphBase}/chats/${encodeURIComponent(chat.id)}/members?$top=100`;
          // Members may paginate; keep the loop small & bounded.
          const seen: SweepResultMember[] = [];
          let memberUrl: string | undefined = membersUrl;
          while (memberUrl) {
            if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const currentMemberUrl: string = memberUrl;
            const mresp: GraphPage<GraphMember> =
              await graphGet<GraphPage<GraphMember>>(currentMemberUrl, opts);
            for (const m of mresp.value) {
              const display = (m.displayName ?? "").trim();
              if (!display) continue;
              seen.push({
                display_name: display,
                user_id: m.userId ?? undefined,
                email: m.email ?? undefined,
              });
            }
            memberUrl = mresp["@odata.nextLink"];
          }
          matched += 1;
          chats.push({
            chat_id: chat.id,
            topic,
            work_date: hit.isoDate,
            members: seen,
          });
        } catch (err) {
          if ((err as { name?: string }).name === "AbortError") throw err;
          errors += 1;
          const msg = err instanceof Error ? err.message : String(err);
          diagnostics.push(`[members] "${topic}" (${chat.id}): ${msg}`);
          chats.push({
            chat_id: chat.id,
            topic,
            work_date: hit.isoDate,
            members: [],
            error: msg,
          });
        }
      }

      nextUrl = resp["@odata.nextLink"];
    }
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      diagnostics.push("[sweep] cancelled by user.");
    } else {
      diagnostics.push(
        `[sweep] fatal: ${err instanceof Error ? err.message : String(err)}`,
      );
      errors += 1;
    }
  }

  onProgress({ totalSeen, matched, errors, currentPage: page, phase: "done" });
  return { chats, diagnostics, rejected_topics: rejected };
}

/**
 * Expand per-chat matches into a flat snapshot object compatible with the
 * server's `normalizeTeamsSnapshot`.
 */
export function buildSnapshot(
  result: SweepResult,
  filters?: SweepFilters,
): TeamsSweepSnapshot {
  const rows: SnapshotRow[] = [];
  for (const chat of result.chats) {
    for (const m of chat.members) {
      rows.push({
        work_date: chat.work_date,
        display_name: m.display_name,
        chat_topic: chat.topic,
        chat_id: chat.chat_id,
      });
    }
  }
  return {
    generated_at: new Date().toISOString(),
    topic_pattern: "MDY-or-ISO",
    tool_version: SWEEP_TOOL_VERSION,
    filters: {
      date_from: filters?.dateFrom,
      date_to: filters?.dateTo,
      weekend_only: filters?.weekendOnly,
      topic_allowlist: filters?.topicAllowlistRegex?.source,
      topic_denylist: filters?.topicDenylistRegex?.source,
    },
    rows,
  };
}
