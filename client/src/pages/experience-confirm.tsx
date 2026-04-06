import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Mode = "mfa" | "welcome";

function emitMfaHandoff(payload: { challengeId: string; code: string; purpose: string }) {
  const enriched = { ...payload, ts: Date.now() };
  try {
    localStorage.setItem("axtask_mfa_handoff", JSON.stringify(enriched));
  } catch {
    // ignore storage failures
  }
  try {
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel("axtask_mfa_handoff");
      bc.postMessage(enriched);
      bc.close();
    }
  } catch {
    // no-op
  }
}

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
  const mode: Mode = window.location.pathname.startsWith("/welcome") ? "welcome" : "mfa";
  const q = new URLSearchParams(window.location.search);
  const challengeId = q.get("challengeId") || "";
  const code = q.get("code") || "";
  const purpose = q.get("purpose") || "";
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (mode === "mfa" && challengeId && code && purpose) {
      emitMfaHandoff({ challengeId, code, purpose });
      setSent(true);
    }
    const t = window.setTimeout(() => {
      window.location.href = "/";
    }, mode === "mfa" ? 1400 : 2600);
    return () => window.clearTimeout(t);
  }, [mode, challengeId, code, purpose]);

  const title =
    mode === "mfa"
      ? "Confirmation received. Sliding you back into AxTask..."
      : "Welcome to AxTask. Your workspace is warming up...";
  const subtitle =
    mode === "mfa"
      ? "We are handing this code to your active AxTask tab. If it does not auto-load, use the button below."
      : "AxTask should auto-load. If it does not, hit the launch button below and jump straight in.";

  const onLaunch = () => {
    if (mode === "mfa" && challengeId && code && purpose) {
      emitMfaHandoff({ challengeId, code, purpose });
      setSent(true);
    }
    window.location.href = "/";
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
              <CheckCheck className="h-6 w-6 text-emerald-300" />
              <motion.span
                aria-hidden
                initial={{ scale: 0.8, opacity: 0.2 }}
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.2, 0.8, 0.2] }}
                transition={{ repeat: Infinity, duration: 2.4 }}
                className="absolute inset-0 rounded-xl border border-emerald-300/40"
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/90">AxTask Confirmation</p>
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight">{title}</h1>
            </div>
          </div>
          <p className="text-sm sm:text-base text-slate-200/90 mb-6">{subtitle}</p>

          <Button
            onClick={onLaunch}
            className="h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 text-slate-900 hover:brightness-105 font-semibold shadow-lg"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {mode === "mfa" ? "✓ Zap me back to AxTask" : "✓ Launch My Quirky AxTask Flow"}
            </span>
          </Button>

          {mode === "mfa" && (
            <p className="mt-4 text-xs text-slate-300">
              Handoff status: {sent ? "sent to active tab" : "waiting"}.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

