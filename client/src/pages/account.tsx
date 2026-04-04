import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Smartphone, ShieldCheck } from "lucide-react";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { normalizeToE164 } from "@shared/phone";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMfaChallenge } from "@/hooks/use-mfa-challenge";
import { MfaVerificationPanel } from "@/components/mfa/mfa-verification-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const { requestChallenge, isRequesting } = useMfaChallenge();

  const [phoneInput, setPhoneInput] = useState("");
  const [mfaOpen, setMfaOpen] = useState(false);
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    maskedDestination?: string;
  } | null>(null);

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeToE164(phoneInput);
      if (!normalized) throw new Error("Enter a valid phone number (US: 10 digits or +1…).");
      return requestChallenge({
        purpose: MFA_PURPOSES.ACCOUNT_VERIFY_PHONE,
        channel: "sms",
        phoneE164: normalized,
      });
    },
    onSuccess: (c) => {
      setChallenge({
        challengeId: c.challengeId,
        expiresAt: c.expiresAt,
        devCode: c.devCode,
        maskedDestination: c.maskedDestination,
      });
      setMfaOpen(true);
      toast({ title: "Code sent", description: "Check your phone for the verification code." });
    },
    onError: (e: Error) =>
      toast({ title: "Could not send code", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!challenge) throw new Error("No active verification");
      const res = await apiRequest("POST", "/api/account/phone/verify/confirm", {
        challengeId: challenge.challengeId,
        code,
      });
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: async () => {
      setMfaOpen(false);
      setChallenge(null);
      setPhoneInput("");
      await refreshUser();
      toast({ title: "Phone verified", description: "You can now use SMS for billing and other secure steps." });
    },
    onError: (e: Error) =>
      toast({ title: "Verification failed", description: e.message, variant: "destructive" }),
  });

  const mfaDescription =
    challenge?.maskedDestination != null && challenge.maskedDestination !== ""
      ? `Enter the code sent to ${challenge.maskedDestination}.`
      : "Enter the code we sent to your phone.";

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to app
      </Link>

      <div className="flex items-center gap-2">
        <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-2xl font-semibold tracking-tight">Account security</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="h-5 w-5" />
            Phone number
          </CardTitle>
          <CardDescription>
            A verified phone enables SMS one-time codes for billing and other sensitive actions, similar to major billing
            flows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.phoneVerified && user.phoneMasked ? (
            <p className="text-sm">
              Verified: <span className="font-medium text-foreground">{user.phoneMasked}</span>
            </p>
          ) : (
            <>
              <MfaVerificationPanel
                open={mfaOpen}
                title="Verify your phone"
                description={mfaDescription}
                expiresAt={challenge?.expiresAt}
                devCode={challenge?.devCode ?? null}
                isBusy={confirmMutation.isPending}
                onDismiss={() => {
                  setMfaOpen(false);
                  setChallenge(null);
                }}
                onResend={() => void sendCodeMutation.mutateAsync()}
                onSubmitCode={async (code): Promise<void> => {
                  await confirmMutation.mutateAsync(code);
                }}
              />

              <div className="space-y-2">
                <Label htmlFor="phone">Mobile number</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+1 555 123 4567"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  disabled={mfaOpen}
                />
                <p className="text-xs text-muted-foreground">
                  US numbers: enter 10 digits or +1. Production SMS uses Twilio (see docs/OTP_DELIVERY.md).
                </p>
              </div>
              <Button
                type="button"
                onClick={() => void sendCodeMutation.mutateAsync()}
                disabled={isRequesting || sendCodeMutation.isPending || !phoneInput.trim() || mfaOpen}
              >
                {isRequesting || sendCodeMutation.isPending ? "Sending…" : "Send verification code"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
