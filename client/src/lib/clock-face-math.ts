/**
 * Map pointer delta from clock center to a minute 0–59 (top = 0, clockwise).
 */
export function polarToClockMinute(dx: number, dy: number): number {
  const theta = Math.atan2(dy, dx);
  const deg = (theta * 180) / Math.PI;
  const clockDeg = (deg + 90 + 360) % 360;
  let m = Math.round((clockDeg / 360) * 60) % 60;
  if (m < 0) m += 60;
  return m;
}

/** 12-hour dial value 1–12 from pointer position. */
export function polarToClockHour12(dx: number, dy: number): number {
  const theta = Math.atan2(dy, dx);
  const deg = (theta * 180) / Math.PI;
  const clockDeg = (deg + 90 + 360) % 360;
  let h = Math.round((clockDeg / 360) * 12) % 12;
  if (h === 0) h = 12;
  return h;
}
