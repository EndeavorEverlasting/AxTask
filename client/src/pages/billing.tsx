import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  ArrowLeft,
  CreditCard,
  Lock,
  Shield,
  Sparkles,
  Wallet,
  Phone,
  ChevronDown,
  Pencil,
  AlertTriangle,
  X,
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
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DonateCta } from "@/components/donate-cta";

type BillingSubscriptionRow = {
  id: string;
  product: string;
  planKey: string;
  status: string;
  displayName: string;
  priceLabel: string | null;
  paymentHealth: "ok" | "grace" | "failed" | "inactive" | "none";
  graceUntil: string | null;
};

type BillingSummary = {
  primarySubscription: BillingSubscriptionRow | null;
  subscriptions: BillingSubscriptionRow[];
  defaultPaymentMethod: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  paymentMethods: {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  }[];
  invoices: {
    id: string;
    createdAt: string | null;
    amountCents: number;
    currency: string;
    status: string;
    description: string;
  }[];
  hasOverdueIssuedInvoice: boolean;
};

type BillingProfile = {
  userId: string;
  legalName: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  updatedAt: string | null;
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

function formatMoney(cents: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`;
  }
}

function formatInvoiceDateSafe(createdAt: string | null | undefined): string {
  if (createdAt == null || createdAt === "") return "—";
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy");
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-4">
      {children}
    </p>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <Badge className="shrink-0 border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">
        Paid
      </Badge>
    );
  }
  if (status === "issued") {
    return <Badge variant="secondary">Issued</Badge>;
  }
  if (status === "void") {
    return <Badge variant="outline">Void</Badge>;
  }
  return <Badge variant="outline">Draft</Badge>;
}

export default function BillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { requestChallenge, isRequesting } = useMfaChallenge();

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErrorObj,
    refetch: refetchSummary,
  } = useQuery<BillingSummary>({
    queryKey: ["/api/billing/summary"],
  });

  const { data: billingProfile } = useQuery<BillingProfile | null>({
    queryKey: ["/api/billing/profile"],
  });

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

  const [subDetailsOpen, setSubDetailsOpen] = useState(false);
  const [addPmOpen, setAddPmOpen] = useState(false);
  const [invoiceExpanded, setInvoiceExpanded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    legalName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  });

  const prevProfileOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = profileOpen && !prevProfileOpenRef.current;
    prevProfileOpenRef.current = profileOpen;
    if (!justOpened) return;
    if (billingProfile) {
      setProfileForm({
        legalName: billingProfile.legalName ?? "",
        line1: billingProfile.line1 ?? "",
        line2: billingProfile.line2 ?? "",
        city: billingProfile.city ?? "",
        region: billingProfile.region ?? "",
        postalCode: billingProfile.postalCode ?? "",
        country: billingProfile.country ?? "US",
      });
    } else {
      setProfileForm({
        legalName: "",
        line1: "",
        line2: "",
        city: "",
        region: "",
        postalCode: "",
        country: "US",
      });
    }
  }, [billingProfile, profileOpen]);

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

  const zipOk = country !== "US" || postalCode.replace(/\D/g, "").length >= 5;

  const formReady = luhnOk && expOk && zipOk && panDigits.length >= 13;

  const deletePmMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/billing/payment-methods/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      toast({ title: "Payment method removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not remove card", description: err.message, variant: "destructive" });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/billing/profile", {
        legalName: profileForm.legalName.trim() || null,
        line1: profileForm.line1.trim() || null,
        line2: profileForm.line2.trim() || null,
        city: profileForm.city.trim() || null,
        region: profileForm.region.trim() || null,
        postalCode: profileForm.postalCode.trim() || null,
        country: profileForm.country.trim() || null,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = text.trim() || res.statusText || `Update failed (${res.status})`;
        try {
          const j = JSON.parse(text) as { message?: string };
          if (typeof j?.message === "string" && j.message.trim()) msg = j.message;
        } catch {
          /* use msg from body text or status */
        }
        throw new Error(msg);
      }
      return res.json() as Promise<BillingProfile>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/billing/profile"] });
      setProfileOpen(false);
      toast({ title: "Billing information updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
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
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: () => {
      setMfaOpen(false);
      setChallenge(null);
      setPanDisplay("");
      setCvc("");
      void queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
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

  const primary = summary?.primarySubscription;
  const showPaymentFailed = primary?.paymentHealth === "failed" || primary?.paymentHealth === "grace";
  const invoiceRows = summary?.invoices ?? [];
  const visibleInvoices = invoiceExpanded ? invoiceRows : invoiceRows.slice(0, 5);

  const billingDisplayName =
    billingProfile?.legalName?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.split("@")[0]?.toUpperCase() ||
    "—";

  const billingAddressLines = [
    billingProfile?.line1,
    billingProfile?.line2,
    [billingProfile?.city, billingProfile?.region, billingProfile?.postalCode].filter(Boolean).join(", "),
    billingProfile?.country,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0));

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
            Manage your AxTask billing settings
          </h1>
          <p className="mt-4 text-zinc-400 text-sm leading-relaxed max-w-sm">
            Subscription, payment methods, and invoices for your account. Sensitive changes require a fresh verification
            code.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-zinc-300">
            <li className="flex gap-3">
              <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">Step-up MFA</span>
                {" — "}for adding cards, aligned with invoice flows.
              </span>
            </li>
            <li className="flex gap-3">
              <Lock className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">No full card storage</span>
                {" — "}only brand, last four, and expiry. Connect a PSP for live charges.
              </span>
            </li>
            <li className="flex gap-3">
              <Sparkles className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">Account plane</span>
                {" — "}billing is separate from tasks and community features.
              </span>
            </li>
            <li className="flex gap-3">
              <Phone className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-white font-medium">Email codes by default</span>
                {" — "}SMS is optional after you verify a phone and configure Twilio on the server.
              </span>
            </li>
          </ul>
          <div className="mt-8">
            <DonateCta variant="secondary" className="w-full sm:w-auto border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800" />
          </div>
          <p className="mt-auto pt-12 text-xs text-zinc-600">
            AxTask · TLS in transit. Production should tokenize cards with your processor.
          </p>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 overflow-y-auto">
        <div className="flex-1 px-6 sm:px-10 lg:px-14 py-10 max-w-2xl w-full mx-auto space-y-12">
          {/* Current subscription */}
          <section>
            <SectionLabel>Current subscription</SectionLabel>
            {summaryLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : summaryError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-3">
                <p className="text-sm font-medium text-destructive">Could not load billing summary</p>
                <p className="text-sm text-muted-foreground">
                  {summaryErrorObj instanceof Error ? summaryErrorObj.message : "Something went wrong. Try again."}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetchSummary()}>
                  Retry
                </Button>
              </div>
            ) : primary ? (
              <div className="rounded-xl border border-border bg-card/30 p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {showPaymentFailed ? (
                    <Badge
                      variant="destructive"
                      className="rounded-full px-2.5 font-normal bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800"
                    >
                      {primary.paymentHealth === "grace" ? "Grace period" : "Payment failed"}
                    </Badge>
                  ) : primary.paymentHealth === "inactive" ? (
                    <Badge variant="secondary">Inactive</Badge>
                  ) : (
                    <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">Active</Badge>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{primary.displayName}</h2>
                  {primary.priceLabel ? (
                    <p className="text-lg font-semibold mt-1">{primary.priceLabel}</p>
                  ) : null}
                </div>
                {primary.paymentHealth === "failed" && summary?.hasOverdueIssuedInvoice ? (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Your latest invoice may be unpaid or overdue. Update your payment method or confirm payment.</span>
                  </div>
                ) : null}
                {summary?.defaultPaymentMethod ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    <span>
                      {brandLabel(summary.defaultPaymentMethod.brand)} •••• {summary.defaultPaymentMethod.last4}
                    </span>
                    {showPaymentFailed ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    ) : null}
                  </div>
                ) : null}
                {(summary?.subscriptions?.length ?? 0) > 1 ? (
                  <Collapsible open={subDetailsOpen} onOpenChange={setSubDetailsOpen}>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline">
                      View details
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", subDetailsOpen && "rotate-180")}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 space-y-2 text-sm border-t border-border mt-3">
                      {summary?.subscriptions.map((s) => (
                        <div key={s.id} className="flex justify-between gap-4 py-1">
                          <span className="text-muted-foreground">{s.displayName}</span>
                          <span className="shrink-0 capitalize">{s.status}</span>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card/30 p-5">
                <Badge className="border-transparent bg-sky-600 text-white mb-3">Included</Badge>
                <h2 className="text-lg font-semibold">Core AxTask access</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  You do not have a separate paid add-on subscription on this account. Tasks, NodeWeaver, and community
                  features are part of your product tier as configured by your administrator.
                </p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/premium">View premium options</Link>
                </Button>
              </div>
            )}
          </section>

          {/* Payment method */}
          <section>
            <SectionLabel>Payment method</SectionLabel>
            {summaryError ? (
              <p className="text-sm text-muted-foreground">
                Payment methods are unavailable until billing summary loads. Use Retry above if loading failed.
              </p>
            ) : (
            <div className="space-y-3">
              {summary && summary.paymentMethods && summary.paymentMethods.length > 0 ? (
                summary.paymentMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {brandLabel(pm.brand)} •••• {pm.last4}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Exp {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pm.isDefault ? (
                        <span className="text-xs font-medium text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950">
                          Default
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={deletePmMutation.isPending}
                        onClick={() => deletePmMutation.mutate(pm.id)}
                        aria-label="Remove payment method"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No saved payment methods yet.</p>
              )}
            </div>
            )}

            <Collapsible open={addPmOpen} onOpenChange={setAddPmOpen} className="mt-4">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span className="text-lg leading-none">+</span> Add payment method
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-6 space-y-6 border-t border-border pt-6">
                <div className="flex items-center gap-2 text-primary">
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-widest">Secure checkout</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Signed in as{" "}
                  <span className="text-foreground font-medium">{user?.email ?? "—"}</span>
                </p>

                <Tabs value={tab} onValueChange={(v) => setTab(v as "card" | "wallet")}>
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
                      challengeId={challenge?.challengeId}
                      purpose={MFA_PURPOSES.BILLING_ADD_PAYMENT_METHOD}
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
                        <p className="text-xs text-muted-foreground">
                          Email is the default (Resend). SMS is an optional second layer when your account has a verified
                          phone and the server has Twilio configured.
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
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
                        </div>
                        {!user?.phoneVerified && (
                          <p className="text-xs text-muted-foreground">
                            <Link href="/account" className="text-primary hover:underline">
                              Verify a phone number
                            </Link>{" "}
                            to enable SMS (requires Twilio on the server in production).
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        By saving, you agree to our billing terms. Charges are processed by your connected payment
                        processor; AxTask stores only non-sensitive card metadata after MFA verification.
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
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* Billing information */}
          <section>
            <SectionLabel>Billing information</SectionLabel>
            <div className="rounded-lg border border-border px-4 py-4 space-y-2">
              <p className="text-sm font-semibold tracking-wide uppercase">{billingDisplayName}</p>
              {billingAddressLines.length > 0 ? (
                billingAddressLines.map((line, i) => (
                  <p key={`${i}-${line}`} className="text-sm text-muted-foreground">
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No billing address on file.</p>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-2"
                onClick={() => setProfileOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Update information
              </button>
            </div>
          </section>

          {/* Invoice history */}
          <section>
            <SectionLabel>Invoice history</SectionLabel>
            {summaryError ? (
              <p className="text-sm text-muted-foreground">
                Invoice history is unavailable until billing summary loads.
              </p>
            ) : invoiceRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {visibleInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 text-sm"
                    >
                      <span className="text-muted-foreground w-32 shrink-0">
                        {formatInvoiceDateSafe(inv.createdAt)}
                      </span>
                      <span className="font-medium w-24 shrink-0">
                        {formatMoney(inv.amountCents, inv.currency)}
                      </span>
                      <InvoiceStatusBadge status={inv.status} />
                      <span className="flex-1 min-w-0 text-muted-foreground truncate">{inv.description}</span>
                    </div>
                  ))}
                </div>
                {invoiceRows.length > 5 ? (
                  <button
                    type="button"
                    className="mt-3 text-sm text-primary hover:underline inline-flex items-center gap-1"
                    onClick={() => setInvoiceExpanded(!invoiceExpanded)}
                  >
                    {invoiceExpanded ? "Show less" : "View more"}
                    <ChevronDown className={cn("h-4 w-4", invoiceExpanded && "rotate-180")} />
                  </button>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update billing information</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="bp-name">Legal name</Label>
              <Input
                id="bp-name"
                value={profileForm.legalName}
                onChange={(e) => setProfileForm((p) => ({ ...p, legalName: e.target.value }))}
                placeholder="Name on receipts"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-l1">Address line 1</Label>
              <Input
                id="bp-l1"
                value={profileForm.line1}
                onChange={(e) => setProfileForm((p) => ({ ...p, line1: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-l2">Address line 2</Label>
              <Input
                id="bp-l2"
                value={profileForm.line2}
                onChange={(e) => setProfileForm((p) => ({ ...p, line2: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bp-city">City</Label>
                <Input
                  id="bp-city"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-region">State / region</Label>
                <Input
                  id="bp-region"
                  value={profileForm.region}
                  onChange={(e) => setProfileForm((p) => ({ ...p, region: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bp-postal">Postal code</Label>
                <Input
                  id="bp-postal"
                  value={profileForm.postalCode}
                  onChange={(e) => setProfileForm((p) => ({ ...p, postalCode: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-country">Country</Label>
                <select
                  id="bp-country"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={profileForm.country}
                  onChange={(e) => setProfileForm((p) => ({ ...p, country: e.target.value }))}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
