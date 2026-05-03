import { useEffect, useMemo, useRef, useState } from "react";
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
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  DEFAULT_FEEDBACK_AVATAR,
  FEEDBACK_AVATAR_BLURBS,
  FEEDBACK_AVATAR_NAMES,
  getAvatarForSource,
  isFeedbackAvatarKey,
  type FeedbackAvatarKey,
} from "@shared/feedback-avatar-map";
import { SKILL_TREE_SOURCE_RE } from "@/lib/skill-tree-feedback";

type NudgeInsightful = "up" | "down" | null;
type NudgeKind = "shown" | "dismissed" | "opened";

function postNudgeEvent(
  kind: NudgeKind,
  avatarKey: FeedbackAvatarKey,
  source: string | undefined,
  insightful: NudgeInsightful,
): void {
  void apiRequest("POST", "/api/archetypes/nudge-event", {
    kind,
    avatarKey,
    source: source ?? null,
    insightful,
  }).catch(() => {
    // Swallow: analytics must never surface errors to the user.
  });
}

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

/**
 * Skill-tree-themed openers. Used when the nudge `source` matches
 * `SKILL_TREE_SOURCE_RE` so the forum-wide voice pool stays untouched
 * (see shared/feedback-avatar-map.ts for the source taxonomy).
 */
const SKILL_TREE_OPENERS: Record<FeedbackAvatarKey, string[]> = {
  archetype: [
    "You slotted in a new skill. What pattern pushed you to pick that branch first?",
    "Structurally, this unlock shifts your leverage. What did you give up to take it?",
  ],
  productivity: [
    "Upgrade locked in. Does it actually unblock your next move, or is it aspirational?",
    "Momentum bought. What will you ship first to pay it back?",
  ],
  mood: [
    "New skill earned. How did that feel — satisfying, or just a check in a box?",
    "You treated yourself with a skill. What do you want that skill to do for you?",
  ],
  social: [
    "Your entourage just grew. Who are you planning to collaborate with next?",
    "More companions on deck. Where will the extra help land first?",
  ],
  lazy: [
    "Nice unlock. No need to charge ahead — what's the calm next step?",
    "You widened your runway. What will you let slow down now?",
  ],
};

/** Listens for `requestFeedbackNudge` events and offers a one-tap path to /feedback. */
export function FeedbackNudgeDialog() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | undefined>();
  const [avatarKey, setAvatarKey] = useState<FeedbackAvatarKey>(DEFAULT_FEEDBACK_AVATAR);
  const [seed, setSeed] = useState(0);
  const [insightful, setInsightful] = useState<NudgeInsightful>(null);
  const resolvedRef = useRef<"dismissed" | "opened" | null>(null);

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
      const nextSource = detail.source;
      const resolvedAvatar: FeedbackAvatarKey = isFeedbackAvatarKey(detail.avatarKey)
        ? detail.avatarKey
        : getAvatarForSource(detail.source);
      setSource(nextSource);
      setAvatarKey(resolvedAvatar);
      setSeed(Math.random());
      setInsightful(null);
      resolvedRef.current = null;
      setOpen(true);
      postNudgeEvent("shown", resolvedAvatar, nextSource, null);
    };
    window.addEventListener("axtask-feedback-nudge", onNudge);
    return () => window.removeEventListener("axtask-feedback-nudge", onNudge);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next && open && resolvedRef.current === null) {
      resolvedRef.current = "dismissed";
      postNudgeEvent("dismissed", avatarKey, source, insightful);
    }
    setOpen(next);
  };

  const personaName = FEEDBACK_AVATAR_NAMES[avatarKey];
  const personaBlurb = FEEDBACK_AVATAR_BLURBS[avatarKey];
  const opener = useMemo(() => {
    if (source && SKILL_TREE_SOURCE_RE.test(source)) {
      const skillPool = SKILL_TREE_OPENERS[avatarKey];
      if (skillPool.length > 0) {
        return skillPool[Math.floor(seed * skillPool.length) % skillPool.length];
      }
    }
    const voice = voices?.voices?.find((v) => v.avatarKey === avatarKey);
    const pool = voice?.openers ?? [];
    if (pool.length > 0) {
      return pool[Math.floor(seed * pool.length) % pool.length];
    }
    return FALLBACK_OPENERS[avatarKey];
  }, [voices, avatarKey, seed, source]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass-panel-glossy sm:max-w-md" onClick={(ev) => ev.stopPropagation()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AvatarOrb variant={avatarKey} size="md" label={personaName} />
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
        <div
          className="flex items-center gap-2 pt-1"
          data-testid="feedback-nudge-insightful"
        >
          <span className="text-xs text-muted-foreground mr-1">Quick read:</span>
          <Button
            type="button"
            size="sm"
            variant={insightful === "up" ? "default" : "outline"}
            aria-pressed={insightful === "up"}
            aria-label="This felt insightful"
            data-testid="feedback-nudge-insightful-up"
            onClick={() => setInsightful((prev) => (prev === "up" ? null : "up"))}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            Insightful
          </Button>
          <Button
            type="button"
            size="sm"
            variant={insightful === "down" ? "default" : "outline"}
            aria-pressed={insightful === "down"}
            aria-label="This felt off"
            data-testid="feedback-nudge-insightful-down"
            onClick={() => setInsightful((prev) => (prev === "down" ? null : "down"))}
          >
            <ThumbsDown className="h-4 w-4 mr-1" />
            Felt off
          </Button>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resolvedRef.current = "dismissed";
              postNudgeEvent("dismissed", avatarKey, source, insightful);
              setOpen(false);
            }}
          >
            Not now
          </Button>
          <Button
            type="button"
            data-avatar-key={avatarKey}
            data-source={source ?? ""}
            onClick={() => {
              resolvedRef.current = "opened";
              postNudgeEvent("opened", avatarKey, source, insightful);
              setOpen(false);
              const params = new URLSearchParams({ avatar: avatarKey });
              if (source) params.set("source", source);
              if (insightful) params.set("insightful", insightful);
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
