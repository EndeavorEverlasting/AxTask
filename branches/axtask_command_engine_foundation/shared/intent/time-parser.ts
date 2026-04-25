import type { ParseCommandContext } from "./intent-types";

export type ParsedTime = {
  date?: string;
  time?: string;
  matchedText?: string;
  confidence: number;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function nextWeekday(now: Date, weekday: number): Date {
  const d = new Date(now);
  const current = d.getDay();
  let delta = weekday - current;
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function parseClockTime(input: string): Pick<ParsedTime, "time" | "matchedText" | "confidence"> {
  const time12 = input.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (time12) {
    let hours = Number(time12[1]);
    const minutes = time12[2] ? Number(time12[2]) : 0;
    const period = time12[3].toLowerCase();

    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    return {
      time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      matchedText: time12[0],
      confidence: 0.95,
    };
  }

  const time24 = input.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (time24) {
    return {
      time: `${String(Number(time24[1])).padStart(2, "0")}:${time24[2]}`,
      matchedText: time24[0],
      confidence: 0.9,
    };
  }

  const fuzzyMorning = input.match(/\b(morning|noon|afternoon|evening|night)\b/i);
  if (fuzzyMorning) {
    const word = fuzzyMorning[1].toLowerCase();
    const map: Record<string, string> = {
      morning: "09:00",
      noon: "12:00",
      afternoon: "14:00",
      evening: "18:00",
      night: "20:00",
    };
    return {
      time: map[word],
      matchedText: fuzzyMorning[0],
      confidence: 0.65,
    };
  }

  // "at 9" is ambiguous. Useful, but should force confirmation.
  const bareHour = input.match(/\bat\s+(\d{1,2})\b/i);
  if (bareHour) {
    const hour = Number(bareHour[1]);
    if (hour >= 1 && hour <= 12) {
      return {
        time: `${String(hour).padStart(2, "0")}:00`,
        matchedText: bareHour[0],
        confidence: 0.45,
      };
    }
  }

  return { confidence: 0 };
}

export function parseDatePhrase(input: string, context: ParseCommandContext): ParsedTime {
  const now = context.now;
  const lower = input.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return { date: toIsoDate(now), matchedText: "today", confidence: 0.95 };
  }

  if (/\btomorrow\b/.test(lower)) {
    return { date: toIsoDate(addDays(now, 1)), matchedText: "tomorrow", confidence: 0.95 };
  }

  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) {
    return {
      date: toIsoDate(addDays(now, Number(inDays[1]))),
      matchedText: inDays[0],
      confidence: 0.9,
    };
  }

  const weekdayMatch = lower.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const dayName = weekdayMatch[1];
    return {
      date: toIsoDate(nextWeekday(now, WEEKDAYS[dayName])),
      matchedText: weekdayMatch[0],
      confidence: 0.8,
    };
  }

  const isoDate = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDate) {
    return { date: isoDate[1], matchedText: isoDate[0], confidence: 0.95 };
  }

  return { confidence: 0 };
}

export function parseDateTime(input: string, context: ParseCommandContext): ParsedTime {
  const datePart = parseDatePhrase(input, context);
  const timePart = parseClockTime(input);

  return {
    date: datePart.date,
    time: timePart.time,
    matchedText: [datePart.matchedText, timePart.matchedText].filter(Boolean).join(" "),
    confidence: Math.max(datePart.confidence, timePart.confidence),
  };
}

export function stripDateTimePhrases(input: string): string {
  return input
    .replace(/\b(?:for\s+)?today\b/gi, " ")
    .replace(/\b(?:for\s+)?tomorrow\b/gi, " ")
    .replace(/\bin\s+\d+\s+days?\b/gi, " ")
    .replace(/\b(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ")
    .replace(/\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/gi, " ")
    .replace(/\b(?:morning|noon|afternoon|evening|night)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
