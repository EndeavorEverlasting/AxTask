export type ParsedRecurrence = {
  recurrence?: "none" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "irregular";
  matchedText?: string;
  confidence: number;
};

export function parseRecurrence(input: string): ParsedRecurrence {
  const lower = input.toLowerCase();

  const patterns: Array<[RegExp, NonNullable<ParsedRecurrence["recurrence"]>, number]> = [
    [/\bevery\s+day\b|\bdaily\b|\beach\s+day\b/, "daily", 0.95],
    [/\bevery\s+week\b|\bweekly\b|\beach\s+week\b/, "weekly", 0.95],
    [/\bevery\s+other\s+week\b|\bbiweekly\b|\bevery\s+2\s+weeks\b/, "biweekly", 0.9],
    [/\bevery\s+month\b|\bmonthly\b|\beach\s+month\b/, "monthly", 0.95],
    [/\bevery\s+quarter\b|\bquarterly\b/, "quarterly", 0.9],
    [/\bevery\s+year\b|\byearly\b|\bannually\b/, "yearly", 0.95],
    [/\bevery\s+now\s+and\s+again\b|\bfrom\s+time\s+to\s+time\b|\boccasionally\b/, "irregular", 0.7],
    [/\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/, "weekly", 0.9],
  ];

  for (const [pattern, recurrence, confidence] of patterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        recurrence,
        matchedText: match[0],
        confidence,
      };
    }
  }

  return { recurrence: "none", confidence: 0 };
}

export function stripRecurrencePhrases(input: string): string {
  return input
    .replace(/\bevery\s+now\s+and\s+again\b/gi, " ")
    .replace(/\bfrom\s+time\s+to\s+time\b/gi, " ")
    .replace(/\boccasionally\b/gi, " ")
    .replace(/\bevery\s+other\s+week\b/gi, " ")
    .replace(/\bevery\s+2\s+weeks\b/gi, " ")
    .replace(/\bevery\s+(?:day|week|month|quarter|year)\b/gi, " ")
    .replace(/\bevery\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
    .replace(/\b(?:daily|weekly|biweekly|monthly|quarterly|yearly|annually)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
