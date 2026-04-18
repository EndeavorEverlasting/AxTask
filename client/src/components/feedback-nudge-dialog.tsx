import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AvatarGlowChip } from "@/components/ui/avatar-glow-chip";
import {
  DEFAULT_FEEDBACK_AVATAR,
  FEEDBACK_AVATAR_BLURBS,
  FEEDBACK_AVATAR_NAMES,
  getAvatarForSource,
  isFeedbackAvatarKey,
  type FeedbackAvatarKey,
} from "@shared/feedback-avatar-map";

type AvatarVoiceDTO = {
  avatarKey: string;
  name: string;
  tone: string;
  openers: string[];
};

type AvatarVoicesPayload = { voices: AvatarVoiceDTO[] };

/** Copy shown when the cached voice map is unavailable (offline, anon, etc.). */
const FALLBACK_OPENERS: Record<FeedbackAvatarKey, string> = {
  archetype:
    "I noticed a pattern in how you just worked — worth two minutes to compare notes?",
  productivity:
    "Nice rhythm right there. Anything that could have made that action smoother?",
  mood:
    "Small moment, worth capturing: how did that feel?",
  social:
    "Bulk actions are tricky — anything that felt risky or confusing?",
  lazy:
    "No urgency here. If something feels unnecessary, tell us and we'll cut it.",
};

/** Listens for `requestFeedbackNudge` events and offers a one-tap path to /feedback. */
export function FeedbackNudgeDialog() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | undefined>();
  const [avatarKey, setAvatarKey] = useState<FeedbackAvatarKey>(DEFAULT_FEEDBACK_AVATAR);
  const [seed, setSeed] = useState(0);

  const { data: voices } = useQuery<AvatarVoicesPayload>({
    queryKey: ["/api/gamification/avatar-voices"],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    const onNudge = (ev: Event) => {
      const e = ev as CustomEvent<{ source?: string; avatarKey?: string }>;
      const detail = e.detail ?? {};
      setSource(detail.source);
      const resolvedAvatar: FeedbackAvatarKey = isFeedbackAvatarKey(detail.avatarKey)
        ? detail.avatarKey
        : getAvatarForSource(detail.source);
      setAvatarKey(resolvedAvatar);
      setSeed(Math.random());
      setOpen(true);
    };
    window.addEventListener("axtask-feedback-nudge", onNudge);
    return () => window.removeEventListener("axtask-feedback-nudge", onNudge);
  }, []);

  const personaName = FEEDBACK_AVATAR_NAMES[avatarKey];
  const personaBlurb = FEEDBACK_AVATAR_BLURBS[avatarKey];
  const opener = useMemo(() => {
    const voice = voices?.voices?.find((v) => v.avatarKey === avatarKey);
    const pool = voice?.openers ?? [];
    if (pool.length > 0) {
      return pool[Math.floor(seed * pool.length) % pool.length];
    }
    return FALLBACK_OPENERS[avatarKey];
  }, [voices, avatarKey, seed]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onClick={(ev) => ev.stopPropagation()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AvatarGlowChip avatarKey={avatarKey} aria-hidden="true" />
            <div className="flex flex-col">
              <DialogTitle className="text-left">
                {personaName} wants a quick thought
              </DialogTitle>
              <span
                className="text-xs text-muted-foreground"
                data-testid="feedback-nudge-persona-blurb"
              >
                {personaBlurb}
              </span>
            </div>
          </div>
          <DialogDescription className="pt-2" data-testid="feedback-nudge-opener">
            {opener}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button
            type="button"
            data-avatar-key={avatarKey}
            data-source={source ?? ""}
            onClick={() => {
              setOpen(false);
              const params = new URLSearchParams({ avatar: avatarKey });
              if (source) params.set("source", source);
              setLocation(`/feedback?${params.toString()}`);
            }}
          >
            Open feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
