import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { AvatarGlowChip } from "@/components/ui/avatar-glow-chip";
import { useNotificationMode } from "@/hooks/use-notification-mode";
import {
  FEEDBACK_AVATAR_BLURBS,
  FEEDBACK_AVATAR_KEYS,
  FEEDBACK_AVATAR_NAMES,
  type FeedbackAvatarKey,
} from "@shared/feedback-avatar-map";

const DEBOUNCE_MS = 500;

type LocalPrefs = {
  master: number;
  byAvatar: Partial<Record<FeedbackAvatarKey, number>>;
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Five per-avatar sliders plus a master "feedback frequency" slider that scales
 * them all. Writes through immediately to localStorage (via the notification
 * hook's cache) and debounces a PATCH to /api/notifications/preferences.
 *
 * See docs/FEEDBACK_AVATAR_NUDGES.md for product rationale.
 */
export function FeedbackNudgeSliders() {
  const { feedbackNudgePrefs, saveFeedbackNudgePrefs, isLoading } = useNotificationMode();
  const [local, setLocal] = useState<LocalPrefs>(() => ({
    master: clamp(feedbackNudgePrefs.master),
    byAvatar: { ...feedbackNudgePrefs.byAvatar },
  }));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal({
      master: clamp(feedbackNudgePrefs.master),
      byAvatar: { ...feedbackNudgePrefs.byAvatar },
    });
  }, [feedbackNudgePrefs.master, feedbackNudgePrefs.byAvatar]);

  const scheduleSave = useCallback(
    (next: LocalPrefs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void saveFeedbackNudgePrefs({ master: next.master, byAvatar: next.byAvatar });
      }, DEBOUNCE_MS);
    },
    [saveFeedbackNudgePrefs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onMasterChange = (value: number) => {
    setLocal((prev) => {
      const next = { ...prev, master: clamp(value) };
      scheduleSave(next);
      return next;
    });
  };

  const onAvatarChange = (key: FeedbackAvatarKey, value: number) => {
    setLocal((prev) => {
      const next: LocalPrefs = {
        ...prev,
        byAvatar: { ...prev.byAvatar, [key]: clamp(value) },
      };
      scheduleSave(next);
      return next;
    });
  };

  const onReset = () => {
    const defaults: LocalPrefs = { master: 50, byAvatar: {} };
    setLocal(defaults);
    scheduleSave(defaults);
  };

  const masterLabel = (() => {
    if (local.master === 0) return "Silent";
    if (local.master <= 30) return "Quiet";
    if (local.master <= 70) return "Balanced";
    return "Chatty";
  })();

  return (
    <div
      className="rounded-lg border border-violet-300/40 bg-violet-50/60 p-3 dark:border-violet-700/40 dark:bg-violet-900/15 space-y-4"
      data-testid="feedback-nudge-sliders"
    >
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-medium text-gray-700 dark:text-gray-200">Feedback frequency</span>
          <span className="font-semibold text-violet-700 dark:text-violet-300">
            {local.master}% · {masterLabel}
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[local.master]}
          onValueChange={(v) => onMasterChange(v[0] ?? 0)}
          disabled={isLoading}
          aria-label="Master feedback frequency"
        />
        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
          Scales every avatar slider below. Set to 0 to silence all feedback prompts.
        </p>
      </div>

      <div className="space-y-3">
        {FEEDBACK_AVATAR_KEYS.map((key) => {
          const value = local.byAvatar[key];
          const display = typeof value === "number" ? value : local.master;
          const inherited = typeof value !== "number";
          return (
            <div key={key} className="space-y-1" data-testid={`feedback-nudge-slider-${key}`}>
              <div className="flex items-center gap-2">
                <AvatarGlowChip avatarKey={key} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                      {FEEDBACK_AVATAR_NAMES[key]}
                    </span>
                    <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                      {display}%{inherited ? " (inherits)" : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight truncate">
                    {FEEDBACK_AVATAR_BLURBS[key]}
                  </p>
                </div>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[display]}
                onValueChange={(v) => onAvatarChange(key, v[0] ?? 0)}
                disabled={isLoading}
                aria-label={`Feedback frequency for ${FEEDBACK_AVATAR_NAMES[key]}`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={isLoading}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
