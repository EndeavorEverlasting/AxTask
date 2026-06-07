export function monthBounds(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/** True when a billing period (exclusive periodEnd) overlaps the UTC calendar month. */
export function matchesMtdMonth(
  periodStart: string,
  periodEnd: string,
  monthStart: string,
  monthEnd: string,
): boolean {
  return periodStart <= monthEnd && periodEnd > monthStart;
}
