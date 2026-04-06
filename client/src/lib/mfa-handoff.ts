/** Session-scoped MFA handoff (email link → main tab). TTL limits exposure if a tab lingers. */
export const MFA_HANDOFF_STORAGE_KEY = "axtask_mfa_handoff";
export const MFA_HANDOFF_CHANNEL = "axtask_mfa_handoff";
/** Max age for a handoff payload (ms). */
export const MFA_HANDOFF_TTL_MS = 5 * 60 * 1000;

export type MfaHandoffPayload = {
  challengeId: string;
  code: string;
  purpose: string;
  ts: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse and validate TTL. Returns null if missing, malformed, or expired. */
export function parseMfaHandoff(raw: string | null): MfaHandoffPayload | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const challengeId = typeof parsed.challengeId === "string" ? parsed.challengeId : "";
    const code = typeof parsed.code === "string" ? parsed.code : "";
    const purpose = typeof parsed.purpose === "string" ? parsed.purpose : "";
    const ts = typeof parsed.ts === "number" && Number.isFinite(parsed.ts) ? parsed.ts : NaN;
    if (!challengeId || !code || !purpose || Number.isNaN(ts)) return null;
    if (Date.now() - ts > MFA_HANDOFF_TTL_MS) return null;
    return { challengeId, code, purpose, ts };
  } catch {
    return null;
  }
}

export function storeMfaHandoffSession(payload: Omit<MfaHandoffPayload, "ts">): MfaHandoffPayload {
  const enriched: MfaHandoffPayload = { ...payload, ts: Date.now() };
  try {
    sessionStorage.setItem(MFA_HANDOFF_STORAGE_KEY, JSON.stringify(enriched));
  } catch {
    // ignore quota / private mode
  }
  try {
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel(MFA_HANDOFF_CHANNEL);
      bc.postMessage(enriched);
      bc.close();
    }
  } catch {
    // no-op
  }
  return enriched;
}

export function consumeMfaHandoffSession(): void {
  try {
    sessionStorage.removeItem(MFA_HANDOFF_STORAGE_KEY);
  } catch {
    // no-op
  }
}

/** Validate a BroadcastChannel / postMessage payload (object, not JSON string). */
export function parseMfaHandoffMessage(data: unknown): MfaHandoffPayload | null {
  if (data == null || typeof data !== "object") return null;
  return parseMfaHandoff(JSON.stringify(data));
}
