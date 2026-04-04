/**
 * Shared phone helpers (E.164-oriented). No external lib — US-centric defaults.
 */

/** Display mask similar to carrier billing UIs, e.g. (***) ***-**60 */
export function maskE164ForDisplay(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 2) return "••••";
  const last2 = digits.slice(-2);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(***) ***-**${last2}`;
  }
  if (digits.length >= 8) {
    return `••••••${last2}`;
  }
  return `•••${last2}`;
}

/**
 * Normalize user input to E.164 when possible. US: 10 digits → +1…
 */
export function normalizeToE164(phone: string, defaultRegion: "US" | "OTHER" = "US"): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (defaultRegion === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}
