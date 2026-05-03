import { addCalendarDaysIso, getWesternEasterSundayIsoDate } from "../../lib/western-easter";

export type PublicHolidayRow = { date: string; name: string };

const NAGER_BASE = "https://date.nager.at/api/v3/PublicHolidays";
const FETCH_TIMEOUT_MS = 12_000;

function dedupeKey(row: PublicHolidayRow): string {
  return `${row.date}\0${row.name.trim().toLowerCase()}`;
}

function rowCoversEasterSunday(row: PublicHolidayRow, easterIso: string): boolean {
  if (row.date !== easterIso) return false;
  const n = `${row.name}`.toLowerCase();
  return n.includes("easter") && n.includes("sunday");
}

function rowCoversEasterMonday(row: PublicHolidayRow, mondayIso: string): boolean {
  if (row.date !== mondayIso) return false;
  const n = `${row.name}`.toLowerCase();
  return n.includes("easter") && n.includes("monday");
}

async function fetchNagerYear(country: string, year: number, outerSignal?: AbortSignal): Promise<PublicHolidayRow[]> {
  const url = `${NAGER_BASE}/${year}/${encodeURIComponent(country)}`;
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);
  const signal =
    outerSignal != null ? AbortSignal.any([outerSignal, timeoutCtrl.signal]) : timeoutCtrl.signal;
  try {
    const res = await fetch(url, {
      signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return [];
    const out: PublicHolidayRow[] = [];
    for (const item of body) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const date = typeof rec.date === "string" ? rec.date : "";
      const name = typeof rec.name === "string" ? rec.name : typeof rec.localName === "string" ? rec.localName : "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && name.trim()) {
        out.push({ date, name: name.trim() });
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Public holidays for a country and set of years, merged with Western Easter
 * Sunday/Monday when missing (Nager US data omits Easter Sunday).
 */
export async function loadMergedPublicHolidays(
  countryCode: string,
  years: number[],
  init?: { signal?: AbortSignal },
): Promise<{ holidays: PublicHolidayRow[]; hadUpstreamData: boolean }> {
  const uniqYears = [...new Set(years)].filter((y) => Number.isFinite(y) && y >= 1990 && y <= 2100).sort((a, b) => a - b);
  const merged: PublicHolidayRow[] = [];
  let hadUpstreamData = false;

  for (const y of uniqYears) {
    const rows = await fetchNagerYear(countryCode, y, init?.signal);
    if (rows.length > 0) hadUpstreamData = true;
    merged.push(...rows);

    const easterSun = getWesternEasterSundayIsoDate(y);
    const easterMon = addCalendarDaysIso(easterSun, 1);
    const hasSun = merged.some((r) => rowCoversEasterSunday(r, easterSun));
    if (!hasSun) merged.push({ date: easterSun, name: "Easter Sunday" });
    const hasMon = merged.some((r) => rowCoversEasterMonday(r, easterMon));
    if (!hasMon) merged.push({ date: easterMon, name: "Easter Monday" });
  }

  const seen = new Set<string>();
  const holidays: PublicHolidayRow[] = [];
  for (const row of merged) {
    const k = dedupeKey(row);
    if (seen.has(k)) continue;
    seen.add(k);
    holidays.push(row);
  }
  holidays.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)));

  return { holidays, hadUpstreamData };
}
