const NAV_LEAD_INS = ["go to ", "open ", "navigate to ", "show "];

export function hasNavigationLeadIn(lowerTranscript: string): boolean {
  return NAV_LEAD_INS.some((p) => lowerTranscript.startsWith(p));
}

/** Returns a simple route token if the transcript looks like navigation, else null. */
export function matchNavigationPath(lowerTranscript: string): string | null {
  for (const lead of NAV_LEAD_INS) {
    if (lowerTranscript.startsWith(lead)) {
      const rest = lowerTranscript.slice(lead.length).trim();
      if (!rest) return null;
      return rest.split(/\s+/)[0] ?? null;
    }
  }
  return null;
}
