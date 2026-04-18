import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CheckCheck, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { storeMfaHandoffSession, shouldPersistMfaEmailHandoff } from "@/lib/mfa-handoff";
import {
  PretextConfirmationShell,
  PretextGlassCard,
  pretextGradientCtaClassName,
} from "@/components/pretext/pretext-confirmation-shell";
import { cn } from "@/lib/utils";

type Mode = "mfa" | "welcome";

const CHIP_LABELS = ["Done", "Shipped", "Closed", "Complete", "Nailed It", "Checked"];

const REDIRECT_COUNTDOWN_SECONDS = 90;

function emitMfaHandoff(payload: { challengeId: string; code: string; purpose: string }) {
  storeMfaHandoffSession(payload);
}

function stripMfaQueryFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("challengeId");
  url.searchParams.delete("code");
  url.searchParams.delete("purpose");
  const next = url.pathname + (url.search ? url.search : "");
  window.history.replaceState({}, "", next);
}

/** Dedupes handoff across React strict-mode remounts (same JS session). */
const mfaHandoffSentRef = { current: false };

export default function ExperienceConfirmPage() {
  const [locationPath] = useLocation();
  /** Per mount / route: avoids double-scheduling countdown; resets when `locationPath` changes. */
  const redirectScheduleStartedRef = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const mode: Mode = locationPath.startsWith("/welcome") ? "welcome" : "mfa";
  const [handoff] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return {
      challengeId: q.get("challengeId") || "",
      code: q.get("code") || "",
      purpose: q.get("purpose") || "",
    };
  });
  const { challengeId, code, purpose } = handoff;
  const [sent, setSent] = useState(() => mfaHandoffSentRef.current);
  const [adminHandoffBlocked, setAdminHandoffBlocked] = useState(false);

  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [userCancelledRedirect, setUserCancelledRedirect] = useState(false);

  const startRedirectCountdown = useCallback((target: string) => {
    if (userCancelledRedirect) return;
    setRedirectTarget(target);
    setSecondsLeft(REDIRECT_COUNTDOWN_SECONDS);
  }, [userCancelledRedirect]);

  useLayoutEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    meta.setAttribute("data-axtask-experience-confirm", "1");
    document.head.appendChild(meta);
    return () => {
      document.querySelector('meta[data-axtask-experience-confirm="1"]')?.remove();
    };
  }, []);

  useEffect(() => {
    redirectScheduleStartedRef.current = false;
  }, [locationPath]);

  useEffect(() => {
    if (mode === "mfa" && challengeId && code && purpose) {
      const persist = shouldPersistMfaEmailHandoff(purpose, {
        userRole: user?.role,
        authLoading,
      });

      if (!persist) {
        if (purpose === MFA_PURPOSES.ADMIN_STEP_UP && !authLoading) {
          setAdminHandoffBlocked(true);
          stripMfaQueryFromUrl();
        }
        return;
      }

      if (!mfaHandoffSentRef.current) {
        emitMfaHandoff({ challengeId, code, purpose });
        mfaHandoffSentRef.current = true;
      }
      setSent(true);
      setAdminHandoffBlocked(false);
      stripMfaQueryFromUrl();
      const redirectTo = purpose === MFA_PURPOSES.ADMIN_STEP_UP ? "/admin" : "/";
      if (!redirectScheduleStartedRef.current && !userCancelledRedirect) {
        redirectScheduleStartedRef.current = true;
        startRedirectCountdown(redirectTo);
      }
    } else if (mode !== "mfa") {
      if (!redirectScheduleStartedRef.current && !userCancelledRedirect) {
        redirectScheduleStartedRef.current = true;
        startRedirectCountdown("/");
      }
    }
  }, [mode, challengeId, code, purpose, user?.role, authLoading, startRedirectCountdown, userCancelledRedirect]);

  useEffect(() => {
    if (userCancelledRedirect) return;
    if (redirectTarget === null || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      window.location.href = redirectTarget;
      return;
    }
    const id = window.setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft, redirectTarget, userCancelledRedirect]);

  const handleStayHere = useCallback(() => {
    setUserCancelledRedirect(true);
    setRedirectTarget(null);
    setSecondsLeft(null);
  }, []);

  const handleGoNow = useCallback(() => {
    if (redirectTarget) {
      window.location.href = redirectTarget;
    } else {
      const dest =
        mode === "mfa" && purpose === MFA_PURPOSES.ADMIN_STEP_UP ? "/admin" : "/";
      window.location.href = dest;
    }
  }, [mode, purpose, redirectTarget]);

  const adminStepUpWaiting = mode === "mfa" && purpose === MFA_PURPOSES.ADMIN_STEP_UP && authLoading;
  const title =
    adminHandoffBlocked
      ? "Sign in with your operator account"
      : adminStepUpWaiting
        ? "Checking your session…"
        : mode === "mfa"
          ? "Confirmation received. Sliding you back into AxTask..."
          : "Welcome to AxTask. Your workspace is warming up...";
  const subtitle =
    adminHandoffBlocked
      ? "This confirmation link is for admin step-up. Sign in as an administrator in this browser, then open the link from your email again."
      : adminStepUpWaiting
        ? "Hang tight while we verify who is signed in."
        : mode === "mfa"
          ? "We are handing this code to your active AxTask tab. If it does not auto-load, use the button below."
          : "AxTask should auto-load. If it does not, hit the launch button below and jump straight in.";

  const onLaunch = () => {
    if (adminHandoffBlocked) {
      window.location.href = "/login";
      return;
    }
    if (mode === "mfa" && challengeId && code && purpose && !mfaHandoffSentRef.current) {
      if (
        shouldPersistMfaEmailHandoff(purpose, {
          userRole: user?.role,
          authLoading,
        })
      ) {
        emitMfaHandoff({ challengeId, code, purpose });
        mfaHandoffSentRef.current = true;
        setSent(true);
      }
    }
    const dest =
      mode === "mfa" && purpose === MFA_PURPOSES.ADMIN_STEP_UP ? "/admin" : "/";
    window.location.href = dest;
  };

  const showRedirectPanel =
    !userCancelledRedirect && redirectTarget !== null && secondsLeft !== null && secondsLeft > 0;

  const redirectPanelCopy = useMemo(() => {
    if (!showRedirectPanel) return "";
    return mode === "welcome"
      ? "Pretext already queued the launch — your workspace wants you back on the canvas. We’ll send you there when the countdown hits zero, unless you’d rather stay and keep reading every measured line on this screen."
      : "Pretext logged the handoff — your other tab should be glowing. We’ll slide you to the app when the timer finishes, unless you tap stay and savor the gradient a little longer.";
  }, [mode, showRedirectPanel]);

  return (
    <PretextConfirmationShell chips={CHIP_LABELS}>
      <div className="space-y-6">
        <PretextGlassCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="relative grid place-items-center h-12 w-12 rounded-xl bg-emerald-400/20 border border-emerald-300/30">
              {adminStepUpWaiting ? (
                <Loader2 className="h-6 w-6 text-emerald-300 animate-spin" aria-hidden />
              ) : (
                <>
                  <CheckCheck className="h-6 w-6 text-emerald-300" />
                  <motion.span
                    aria-hidden
                    initial={{ scale: 0.8, opacity: 0.2 }}
                    animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.8, 0.2] }}
                    transition={{ repeat: Infinity, duration: 2.4 }}
                    className="absolute inset-0 rounded-xl border border-emerald-300/40"
                  />
                </>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/90">AxTask Confirmation</p>
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight">{title}</h1>
            </div>
          </div>
          <p className="text-sm sm:text-base text-slate-200/90 mb-6">{subtitle}</p>

          <Button
            onClick={onLaunch}
            disabled={adminStepUpWaiting}
            className={cn("h-12 px-6 w-full sm:w-auto", pretextGradientCtaClassName)}
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {adminHandoffBlocked
                ? "Sign in"
                : mode === "mfa"
                  ? "✓ Zap me back to AxTask"
                  : "✓ Launch My Quirky AxTask Flow"}
            </span>
          </Button>

          {mode === "mfa" && (
            <p className="mt-4 text-xs text-slate-300">
              {adminHandoffBlocked
                ? "Handoff not sent — administrator session required in this browser."
                : `Handoff status: ${sent ? "sent to active tab" : "waiting"}.`}
            </p>
          )}
        </PretextGlassCard>

        {showRedirectPanel && (
          <PretextGlassCard className="border-amber-300/25 bg-amber-500/5">
            <p className="text-sm text-slate-100/95 leading-relaxed mb-4">{redirectPanelCopy}</p>
            <p className="text-xs uppercase tracking-[0.15em] text-amber-200/90 mb-4">
              Auto-redirect in{" "}
              <span className="tabular-nums font-semibold text-white text-base">{secondsLeft}</span>s — default
              unless you stay
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={handleStayHere}
              >
                Stay here
              </Button>
              <Button
                type="button"
                onClick={handleGoNow}
                className={cn("h-11 px-5", pretextGradientCtaClassName)}
              >
                Go now
              </Button>
            </div>
          </PretextGlassCard>
        )}
      </div>
    </PretextConfirmationShell>
  );
}
