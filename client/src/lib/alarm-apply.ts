import { apiRequest } from "@/lib/queryClient";
import { applyNativeAlarmSnapshotPayload } from "@/lib/native-reminder-bridge";

type ApplyChannel = "companion" | "native_bridge" | "browser_fallback";

function tryScheduleBrowserNotification(payloadJson: string): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    const title = typeof parsed.taskActivity === "string" ? parsed.taskActivity : "AxTask alarm";
    const alarmAtIso = typeof parsed.alarmAtIso === "string" ? parsed.alarmAtIso : "";
    const alarmAt = alarmAtIso ? new Date(alarmAtIso).getTime() : NaN;
    const delayMs = Number.isFinite(alarmAt) ? Math.max(0, alarmAt - Date.now()) : 0;
    window.setTimeout(() => {
      void new Notification("Task alarm", { body: title });
    }, delayMs);
    return true;
  } catch {
    return false;
  }
}

export async function applyAlarmPayloadWithFallback(payloadJson: string): Promise<{ channel: ApplyChannel }> {
  try {
    const res = await apiRequest("POST", "/api/alarm-companion/apply", { payloadJson });
    if (res.ok) return { channel: "companion" };
  } catch {
    // fall through to native bridge and browser fallback
  }

  try {
    await applyNativeAlarmSnapshotPayload(payloadJson);
    return { channel: "native_bridge" };
  } catch {
    // bridge not active or failed
  }

  const fallbackApplied = tryScheduleBrowserNotification(payloadJson);
  if (!fallbackApplied && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission();
  }
  return { channel: "browser_fallback" };
}
