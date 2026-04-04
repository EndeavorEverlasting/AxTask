import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CreditCard,
  Lock,
  Shield,
  Sparkles,
  Wallet,
  Phone,
} from "lucide-react";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMfaChallenge } from "@/hooks/use-mfa-challenge";
import { MfaVerificationPanel } from "@/components/mfa/mfa-verification-panel";
import { formatPanGroups, inferBrandFromPan, last4FromPan, luhnValid } from "@/lib/billing-card-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SavedPm = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  country: string | null;
  isDefault: boolean;
  createdAt: string | null;
};

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
];

function maskEmail(email: string): string {
  const [u, dom] = email.split("@");
  if (!u || !dom) return email;
  const head = u.slice(0, 2);
  return `${head}•••@${dom}`;
}

function brandLabel(b: string): string {
  switch (b) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
      return "Amex";
    case "discover":
      return "Discover";
    default:
      return "Card";
  }
}

export default function BillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { requestChallenge, isRequesting } = useMfaChallenge();

  const [tab, setTab] = useState<"card" | "wallet">("card");
  const [panDisplay, setPanDisplay] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [country, setCountry] = useState("US");
  const [postalCode, setPostalCode] = useState("");
  const [isDefault, setIsDefault] = useState(true);

  const [mfaOpen, setMfaOpen] = useState(false);
  const [otpChannel, setOtpChannel] = useState<"email" | "sms">("email");
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    deliveredVia?: "email" | "sms";
    maskedDestination?: string;
  } | null>(null);

  useEffect(() => {
    setOtpChannel(user?.phoneVerified ? "sms" : "email");
  }, [user?.phoneVerified]);

  const mapChallenge = (c: {
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    deliveredVia?: "email" | "sms";
    maskedDestination?: string;
  }) => ({
    challengeId: c.challengeId,
    expiresAt: c.expiresAt,
    devCode: c.devCode,
    deliveredVia: c.deliveredVia,
    maskedDestination: c.maskedDestination,
  });

  const sendBillingChallenge = async (channel: "email" | "sms") =>
    requestChallenge({
      purpose: MFA_PURPOSES.BILLING_ADD_PAYMENT_METHOD,
      channel,
    });

  const panDigits = useMemo(() => panDisplay.replace(/\D/g, ""), [panDisplay]);
  const brand = useMemo(() => inferBrandFromPan(panDigits), [panDigits]);
  const luhnOk = useMemo(() => luhnValid(panDigits), [panDigits]);

  const now = new Date();
  const yNum = parseInt(expYear, 10);
  const mNum = parseInt(expMonth, 10);
  const expOk =
    expMonth.length > 0 &&
    expYear.length === 4 &&
    !Number.isNaN(yNum) &&
    !Number.isNaN(mNum) &&
    mNum >= 1 &&
    mNum <= 12 &&
    (yNum > now.getFullYear() ||
      (yNum === now.getFullYear() && mNum >= now.getMonth() + 1));

  const zipOk = country !== "US" || (postalCode.replace(/\D/g, "").length >= 5);

  const formReady = luhnOk && expOk && zipOk && panDigits.length >= 13;

  const { data: saved = [] } = useQuery<SavedPm[]>({
    queryKey: ["/api/billing/payment-methods"],
  });

  const saveMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!challenge) throw new Error("Missing verification");
      const last4 = last4FromPan(panDigits);
      if (last4.length !== 4) throw new Error("Invalid card");

      const res = await apiRequest("POST", "/api/billing/payment-methods", {
        challengeId: challenge.challengeId,
        code,
        brand,
        last4,
        expMonth: mNum,
        expYear: yNum,
        country,
        postalCode: postalCode.trim() || undefined,
        isDefault,
      });
      return res.json() as Promise<SavedPm>;
    },
    onSuccess: () => {
      setMfaOpen(false);
      setChallenge(null);
      setPanDisplay("");
      setCvc("");
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      toast({
        title: "Payment method saved",
        description: "Your card is protected with verification and only a secure fingerprint is stored.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save card",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const startVerification = async () => {
    if (!formReady || tab !== "card") return;
    try {
      const c = await sendBillingChallenge(otpChannel);
      setChallenge(mapChallenge(c));
      setMfaOpen(true);
    } catch (e) {
      toast({
        title: "Verification failed to start",
        description: e instanceof Error ? e.message : "Try again shortly.",
        variant: "destructive",
      });
    }
  };

  const handleResend = async () => {
    try {
      const c = await sendBillingChallenge(otpChannel);
      setChallenge(mapChallenge(c));
      toast({ title: "New code sent", description: "Use the latest verification code." });
    } catch (e) {
      toast({
        title: "Could not resend",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const switchOtpChannel = async (next: "email" | "sms") => {
    setOtpChannel(next);
    try {
      const c = await sendBillingChallenge(next);
      setChallenge(mapChallenge(c));
      toast({
        title: next === "sms" ? "Code sent to phone" : "Code sent to email",
        description: "Use the new verification code.",
      });
    } catch (e) {
      toast({
        title: "Could not send code",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const mfaDescription =
    challenge?.maskedDestination != null && challenge.maskedDestination !== ""
      ? `Enter the code sent to ${challenge.maskedDestination}.`
      : challenge?.deliveredVia === "sms"
        ? "Enter the code sent to your phone."
        : `Enter the code sent to ${user?.email ? maskEmail(user.email) : "your email"}.`;

  return (
    <div className="min-h-full flex flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950">
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative lg:w-[min(420px,38vw)] shrink-0 bg-zinc-950 text-zinc-100 px-8 py-10 lg:min-h-full flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.12),_transparent_50%)] pointer-events-none" />
        <div className="relative z-10 flex flex-col flex-1">
          <Link
            href="/premium"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-10"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to AxTask
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-tight">
            Billing &amp; payment methods
          </h1>
          <p className="mt-4 text-zinc-400 text-sm leading-relaxed max-w-sm">
            A calm, high-trust checkout. Sensitive changes always require a fresh verification code.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-zinc-300">
            <li className="flex gap-3">
              <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">Step-up MFA</span>
                {" — "}one-time codes for adding cards, aligned with your invoice flows.
              </span>
            </li>
            <li className="flex gap-3">
              <Lock className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">No full card storage</span>
                {" — "}only brand, last four digits, and expiry. Wire Stripe or another PSP for live charges.
              </span>
            </li>
            <li className="flex gap-3">
              <Sparkles className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">Built for reuse</span>
                {" — "}the same MFA panel and API power billing and other sensitive actions.
              </span>
            </li>
            <li className="flex gap-3">
              <Phone className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">SMS or email codes</span>
                {" — "}verify a phone under Account to get text-message codes; switch delivery anytime during checkout.
              </span>
            </li>
          </ul>
          <p className="mt-auto pt-12 text-xs text-zinc-600">
            AxTask · Encrypted in transit (TLS). Production deployments should tokenize cards with your processor.
          </p>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50">
        <div className="flex-1 px-6 sm:px-10 lg:px-14 py-10 max-w-xl mx-auto w-full">
          <div className="flex items-center gap-2 text-primary mb-2">
            <CreditCard className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-widest">Secure checkout</span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Add payment method
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            You are signed in as{" "}
            <span className="text-foreground font-medium">{user?.email ?? "—"}</span>
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "card" | "wallet")} className="mt-8">
            <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg">
              <TabsTrigger
                value="card"
                className="rounded-md data-[state=active]:bg-white data-[state=active]:dark:bg-zinc-950 data-[state=active]:shadow-sm"
              >
                Card
              </TabsTrigger>
              <TabsTrigger
                value="wallet"
                disabled
                className="rounded-md opacity-50 cursor-not-allowed gap-1.5"
              >
                <Wallet className="h-3.5 w-3.5" />
                Google Pay
              </TabsTrigger>
            </TabsList>

            <TabsContent value="card" className="mt-8 space-y-8 outline-none">
              <MfaVerificationPanel
                open={mfaOpen}
                title="Verify before we save your card"
                description={mfaDescription}
                expiresAt={challenge?.expiresAt}
                devCode={challenge?.devCode ?? null}
                isBusy={saveMutation.isPending}
                onDismiss={() => {
                  setMfaOpen(false);
                  setChallenge(null);
                }}
                onResend={handleResend}
                onSubmitCode={async (code): Promise<void> => {
                  await saveMutation.mutateAsync(code);
                }}
                alternateDelivery={
                  user?.phoneVerified
                    ? otpChannel === "sms"
                      ? {
                          label: "Send code to email instead",
                          onPress: () => void switchOtpChannel("email"),
                          disabled: saveMutation.isPending,
                        }
                      : {
                          label: "Send code to phone instead",
                          onPress: () => void switchOtpChannel("sms"),
                          disabled: saveMutation.isPending,
                        }
                    : undefined
                }
                className="mb-2"
              />

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="card-pan">Card number</Label>
                  <Input
                    id="card-pan"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 1234 1234 1234"
                    className={cn(
                      "h-11 text-base tracking-wide font-mono",
                      panDigits.length >= 13 && !luhnOk && "border-destructive",
                    )}
                    value={panDisplay}
                    onChange={(e) => setPanDisplay(formatPanGroups(e.target.value))}
                  />
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {panDigits.length >= 13
                        ? luhnOk
                          ? "Number looks valid"
                          : "Check the card number"
                        : " "}
                    </span>
                    <span className="shrink-0 opacity-70">Visa · Mastercard · Amex · Discover</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Expiration</Label>
                    <div className="flex gap-2">
                      <Input
                        inputMode="numeric"
                        placeholder="MM"
                        maxLength={2}
                        autoComplete="cc-exp-month"
                        className="h-11 font-mono"
                        value={expMonth}
                        onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      />
                      <Input
                        inputMode="numeric"
                        placeholder="YYYY"
                        maxLength={4}
                        autoComplete="cc-exp-year"
                        className="h-11 font-mono"
                        value={expYear}
                        onChange={(e) => setExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cvc">Security code</Label>
                    <Input
                      id="cvc"
                      inputMode="numeric"
                      maxLength={4}
                      type="password"
                      autoComplete="cc-csc"
                      placeholder="CVC"
                      className="h-11 font-mono"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                    <p className="text-[11px] text-muted-foreground">Never stored on our servers.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <select
                      id="country"
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">ZIP / postal code</Label>
                    <Input
                      id="zip"
                      autoComplete="postal-code"
                      className="h-11"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="default-pm"
                    checked={isDefault}
                    onCheckedChange={(v) => setIsDefault(v === true)}
                  />
                  <Label htmlFor="default-pm" className="text-sm font-normal cursor-pointer">
                    Use as default payment method
                  </Label>
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3 space-y-2">
                  <Label className="text-sm font-medium">Verification code delivery</Label>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="otp-channel"
                        className="accent-primary"
                        checked={otpChannel === "sms"}
                        disabled={!user?.phoneVerified}
                        onChange={() => setOtpChannel("sms")}
                      />
                      <span>
                        Text message
                        {user?.phoneVerified && user.phoneMasked ? (
                          <span className="text-muted-foreground"> · {user.phoneMasked}</span>
                        ) : null}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="otp-channel"
                        className="accent-primary"
                        checked={otpChannel === "email"}
                        onChange={() => setOtpChannel("email")}
                      />
                      <span>Email</span>
                    </label>
                  </div>
                  {!user?.phoneVerified && (
                    <p className="text-xs text-muted-foreground">
                      <Link href="/account" className="text-primary hover:underline">
                        Verify a phone number
                      </Link>{" "}
                      to use SMS codes (recommended for account security).
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  By saving, you agree to our billing terms. Charges are processed by your connected payment processor;
                  AxTask stores only non-sensitive card metadata after MFA verification.
                </p>

                <Button
                  type="button"
                  size="lg"
                  className="w-full h-12 text-base font-medium shadow-sm bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                  disabled={!formReady || isRequesting || saveMutation.isPending || mfaOpen}
                  onClick={() => void startVerification()}
                >
                  {isRequesting ? "Sending code…" : mfaOpen ? "Enter code above" : "Continue securely"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="wallet" className="mt-8">
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 p-8 text-center text-sm text-muted-foreground">
                <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-foreground">Wallet pay</p>
                <p className="mt-2 max-w-xs mx-auto">
                  When you connect Stripe (or another processor), Google Pay and Apple Pay can use the same MFA step
                  before tokens are saved.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {saved.length > 0 && (
            <div className="mt-14 pt-10 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-foreground mb-4">Saved methods</h3>
              <ul className="space-y-2">
                {saved.map((pm) => (
                  <li
                    key={pm.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm"
                  >
                    <span>
                      {brandLabel(pm.brand)} ·••• {pm.last4}
                      <span className="text-muted-foreground ml-2">
                        {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                      </span>
                    </span>
                    {pm.isDefault && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Default</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
