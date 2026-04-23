import { apiRequest } from "@/lib/queryClient";
import { applyNativeAlarmSnapshotPayload } from "@/lib/native-reminder-bridge";

type ApplyChannel = "companion" | "native_bridge" | "browser_fallback";

export function describeApplyChannel(channel: ApplyChannel): string {
  switch (channel) {
    case "companion":
      return "Host companion (native notify)";
    case "native_bridge":
      return "In-app native bridge";
    case "browser_fallback":
      return "Browser notification (fallback)";
    default:
      return channel;
  }
}

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

export async function applyAlarmPayloadWithFallback(
  payloadJson: string,
): Promise<{ channel: ApplyChannel; companionSnippet?: string }> {
  try {
    const res = await apiRequest("POST", "/api/alarm-companion/apply", { payloadJson });
    const text = await res.text();
    const companionSnippet = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    return { channel: "companion", companionSnippet };
  } catch {
    // fall through to native bridge and browser fallback
  }

  const nativeApplied = await applyNativeAlarmSnapshotPayload(payloadJson);
  if (nativeApplied) {
    return { channel: "native_bridge" };
  }

  const fallbackApplied = tryScheduleBrowserNotification(payloadJson);
  if (!fallbackApplied && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission();
  }
  return { channel: "browser_fallback" };
}
