import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCheck, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { storeMfaHandoffSession, shouldPersistMfaEmailHandoff } from "@/lib/mfa-handoff";

type Mode = "mfa" | "welcome";

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

function CompletedSplash() {
  const chips = useMemo(
    () => ["Done", "Shipped", "Closed", "Complete", "Nailed It", "Checked"],
    [],
  );
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {chips.map((label, idx) => (
        <motion.div
          key={`${label}-${idx}`}
          initial={{ opacity: 0, y: 16, x: (idx % 2 === 0 ? -1 : 1) * 30, scale: 0.9 }}
          animate={{ opacity: [0, 1, 0], y: [-8, -32, -50], x: [0, (idx % 2 === 0 ? -1 : 1) * 12, 0], scale: [0.9, 1, 0.98] }}
          transition={{ duration: 1.8, delay: 0.08 * idx, repeat: Infinity, repeatDelay: 0.6 }}
          className="absolute text-xs sm:text-sm rounded-full border border-emerald-300/50 bg-emerald-50/80 px-3 py-1 text-emerald-700"
          style={{ left: `${10 + (idx * 14) % 75}%`, top: `${56 + (idx * 9) % 28}%` }}
        >
          {label}
        </motion.div>
      ))}
    </div>
  );
}

export default function ExperienceConfirmPage() {
  const { user, loading: authLoading } = useAuth();
  const mode: Mode = window.location.pathname.startsWith("/welcome") ? "welcome" : "mfa";
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
    let t: number | undefined;
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
        return () => {
          if (t !== undefined) window.clearTimeout(t);
        };
      }

      if (!mfaHandoffSentRef.current) {
        emitMfaHandoff({ challengeId, code, purpose });
        mfaHandoffSentRef.current = true;
      }
      setSent(true);
      setAdminHandoffBlocked(false);
      stripMfaQueryFromUrl();
      const redirectTo = purpose === MFA_PURPOSES.ADMIN_STEP_UP ? "/admin" : "/";
      t = window.setTimeout(() => {
        window.location.href = redirectTo;
      }, 1400);
    } else if (mode !== "mfa") {
      t = window.setTimeout(() => {
        window.location.href = "/";
      }, 2600);
    }
    return () => {
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [mode, challengeId, code, purpose, user?.role, authLoading]);

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

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <CompletedSplash />
      <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24 relative">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-7 sm:p-10 shadow-2xl"
        >
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
            className="h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 text-slate-900 hover:brightness-105 font-semibold shadow-lg disabled:opacity-60"
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
        </motion.div>
      </div>
    </div>
  );
}
