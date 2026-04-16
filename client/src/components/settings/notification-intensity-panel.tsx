import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useNotificationMode } from "@/hooks/use-notification-mode";

/** Notification toggle + intensity — shared by Sidebar and Settings. */
export function NotificationIntensityPanel() {
  const {
    isLoading: notificationLoading,
    enabled: notificationEnabled,
    intensity: notificationIntensity,
    pushStatus,
    dispatchProfile,
    deliveryChannel,
    toggleNotificationMode,
    setLocalIntensity,
    saveIntensity,
  } = useNotificationMode();

  const notificationStatusLabel = (() => {
    if (pushStatus === "unsupported") return "Not supported";
    if (pushStatus === "denied") return "Permission denied";
    if (!notificationEnabled) return "Off";
    const channel = deliveryChannel === "push" ? "push" : "in-app";
    return `On (${notificationIntensity}%, ${channel})`;
  })();
  const notificationCadenceSummary = dispatchProfile?.cadenceMinutes
    ? `Every ${dispatchProfile.cadenceMinutes}m · Max ${dispatchProfile.maxPerDay}/day`
    : "No scheduled reminders";

  return (
    <div className="rounded-lg border border-sky-300/40 bg-sky-50/60 p-3 dark:border-sky-700/40 dark:bg-sky-900/15">
      <Button
        variant={notificationEnabled ? "default" : "outline"}
        size="sm"
        onClick={() => void toggleNotificationMode()}
        disabled={notificationLoading}
        className={`w-full justify-between ring-1 ring-sky-400/40 ${
          notificationEnabled ? "bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-500/30" : "bg-sky-50/70 dark:bg-sky-900/20"
        }`}
        title="Toggle push notifications"
      >
        <span className="flex items-center">
          <BellRing className="mr-2 h-4 w-4" />
          {notificationEnabled ? "Disable Notifications" : "Enable Notifications"}
        </span>
      </Button>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-gray-600 dark:text-gray-300">Intensity</span>
          <span className="font-semibold text-sky-700 dark:text-sky-300">{notificationIntensity}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[notificationIntensity]}
          onValueChange={(value) => setLocalIntensity(value[0] ?? 0)}
          onValueCommit={(value) => void saveIntensity(value[0] ?? 0)}
          disabled={notificationLoading}
          aria-label="Notification intensity"
        />
        <p className="text-[11px] text-gray-600 dark:text-gray-400">Status: {notificationStatusLabel}</p>
        <p className="text-[11px] text-gray-600 dark:text-gray-400">{notificationCadenceSummary}</p>
      </div>
    </div>
  );
}
