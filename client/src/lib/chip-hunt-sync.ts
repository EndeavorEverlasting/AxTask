import { apiFetch } from "@/lib/queryClient";

/** Flush accumulated chip hunt stats. Returns false on 401/429/network failure. */
export async function flushChipHuntSync(chaseMsDelta: number, catchEvent: boolean): Promise<boolean> {
  if (chaseMsDelta <= 0 && !catchEvent) return true;
  try {
    const res = await apiFetch("POST", "/api/gamification/chip-hunt/sync", {
      chaseMsDelta: Math.round(chaseMsDelta),
      catchEvent: catchEvent || undefined,
    });
    if (res.status === 401 || res.status === 429) return false;
    return res.ok;
  } catch {
    return false;
  }
}
