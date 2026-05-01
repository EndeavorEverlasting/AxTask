import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";

export function TotpStep({
  totpEmailMask,
  totpCode,
  setTotpCode,
  submitting,
  error,
  onSubmitCode,
  onBack,
}: {
  totpEmailMask?: string;
  totpCode: string;
  setTotpCode: (v: string) => void;
  submitting: boolean;
  error: string;
  onSubmitCode: (code: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-100 mb-2">Authenticator code</h2>
      <p className="text-sm text-slate-400 leading-relaxed">
        Enter the 6-digit code from Google Authenticator or Microsoft Authenticator
        {totpEmailMask ? (
          <>
            {" "}
            for <span className="font-medium text-foreground">{totpEmailMask}</span>
          </>
        ) : null}
        .
      </p>
      <div className="flex justify-center py-2">
        <InputOTP
          maxLength={6}
          value={totpCode}
          onChange={(v) => {
            const next = v.replace(/\D/g, "").slice(0, 6);
            setTotpCode(next);
            if (next.length === 6) void onSubmitCode(next);
          }}
          disabled={submitting}
          containerClassName="gap-1.5"
        >
          <InputOTPGroup className="gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-11 w-10 rounded-md border-white/20 bg-white/5"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        className={cn("w-full h-11", pretextGradientCtaClassName)}
        disabled={submitting || totpCode.replace(/\D/g, "").length !== 6}
        onClick={() => void onSubmitCode(totpCode)}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Verify and continue
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary"
        onClick={onBack}
      >
        ← Back to sign in
      </button>
    </div>
  );
}
