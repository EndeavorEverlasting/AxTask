import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import {
  consumeMfaHandoffSession,
  MFA_HANDOFF_CHANNEL,
  MFA_HANDOFF_STORAGE_KEY,
  parseMfaHandoff,
  parseMfaHandoffMessage,
  type MfaHandoffPayload,
} from "@/lib/mfa-handoff";

export type MfaVerificationPanelProps = {
  open: boolean;
  challengeId?: string;
  /** When true, blocks OTP entry/submit (e.g. challenge not ready). */
  codeEntryDisabled?: boolean;
  purpose?: string;
  title?: string;
  description?: string;
  expiresAt?: string | null;
  devCode?: string | null;
  isBusy?: boolean;
  onDismiss: () => void;
  onResend: () => void | Promise<void>;
  onSubmitCode: (code: string) => void | Promise<void>;
  /** e.g. "Send code to email instead" — shown when SMS is active */
  alternateDelivery?: { label: string; onPress: () => void; disabled?: boolean };
  className?: string;
};

/**
 * Dismissible, boxed MFA step (OTP) for any sensitive flow — billing, invoices, etc.
 */
export function MfaVerificationPanel({
  open,
  challengeId,
  codeEntryDisabled,
  purpose,
  title = "Confirm it is you",
  description = "Enter the verification code we sent to your account email.",
  expiresAt,
  devCode,
  isBusy,
  onDismiss,
  onResend,
  onSubmitCode,
  alternateDelivery,
  className,
}: MfaVerificationPanelProps) {
  const [value, setValue] = useState("");
  const handoffAppliedRef = useRef(false);
  const submittedRef = useRef(false);
  const handleCompleteRef = useRef<(code: string) => void | Promise<void>>(() => {});

  const otpDisabled = Boolean(isBusy || codeEntryDisabled || !challengeId);

  const handleComplete = useCallback(
    async (code: string) => {
      if (code.length !== 6 || isBusy || codeEntryDisabled || !challengeId) return;
      consumeMfaHandoffSession();
      try {
        await onSubmitCode(code);
      } catch (err) {
        console.error("[mfa-verification] onSubmitCode rejected", err);
      }
    },
    [isBusy, onSubmitCode, codeEntryDisabled, challengeId],
  );

  handleCompleteRef.current = handleComplete;

  useEffect(() => {
    if (!open) {
      setValue("");
      submittedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !challengeId) return;

    handoffAppliedRef.current = false;
    submittedRef.current = false;

    const applyHandoff = (parsed: MfaHandoffPayload | null) => {
      if (handoffAppliedRef.current) return;
      if (!parsed || parsed.challengeId !== challengeId) return;
      if (purpose && parsed.purpose !== purpose) return;
      const code = String(parsed.code || "").replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) return;
      if (submittedRef.current) return;
      handoffAppliedRef.current = true;
      submittedRef.current = true;
      setValue(code);
      void handleCompleteRef.current(code);
    };

    let bc: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      bc = new BroadcastChannel(MFA_HANDOFF_CHANNEL);
      bc.onmessage = (ev: MessageEvent) => {
        applyHandoff(parseMfaHandoffMessage(ev.data));
      };
    }

    try {
      applyHandoff(parseMfaHandoff(sessionStorage.getItem(MFA_HANDOFF_STORAGE_KEY)));
    } catch {
      // ignore
    }

    return () => {
      if (bc) bc.close();
    };
  }, [open, challengeId, purpose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative rounded-xl border border-border/80 bg-card/95 shadow-lg shadow-black/[0.04] backdrop-blur-sm",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              {title}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={onDismiss}
              aria-label="Close verification"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4 px-4 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            {expiresAt && (
              <p className="text-xs text-muted-foreground">
                Code expires {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <InputOTP
                maxLength={6}
                value={value}
                onChange={(v) => {
                  const next = v.replace(/\D/g, "").slice(0, 6);
                  setValue(next);
                  if (next.length < 6) {
                    submittedRef.current = false;
                    return;
                  }
                  if (submittedRef.current) return;
                  submittedRef.current = true;
                  void handleComplete(next);
                }}
                disabled={otpDisabled}
                containerClassName="gap-1.5"
              >
                <InputOTPGroup className="gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="h-11 w-10 rounded-md border-border/90 text-base font-medium first:rounded-md last:rounded-md"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {devCode && (
                <p className="text-xs font-mono text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md px-2 py-1">
                  Dev code: {devCode}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <button
                type="button"
                className="text-primary hover:underline disabled:opacity-50"
                disabled={isBusy}
                onClick={() => void onResend()}
              >
                Resend code
              </button>
              {alternateDelivery && (
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-50"
                  disabled={isBusy || alternateDelivery.disabled}
                  onClick={() => alternateDelivery.onPress()}
                >
                  {alternateDelivery.label}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
