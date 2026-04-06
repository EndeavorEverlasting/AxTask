function utcDayStartMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    throw new Error(`Invalid date string: ${dateA} or ${dateB}`);
  }
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.abs(Math.floor((utcDayStartMs(a) - utcDayStartMs(b)) / dayMs));
}
