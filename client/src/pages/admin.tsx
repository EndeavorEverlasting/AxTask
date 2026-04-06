import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/use-count-up";
import type { SafeUser, SecurityLog } from "@shared/schema";
import { MFA_PURPOSES } from "@shared/mfa-purposes";

type LifetimePremiumGrant = { userId: string; product: string; planKey: string };
type AdminUserRow = SafeUser & { lifetimePremiumGrants: LifetimePremiumGrant[] };

type AdminAppealRow = {
  id: string;
  appellantUserId: string;
  subjectType: string;
  subjectRef: string;
  title: string;
  body: string;
  status: string;
  resolution: string | null;
  adminCountAtOpen: number | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string | null;
  grantVotes: number;
  denyVotes: number;
  threshold: { adminCount: number; grantNeeded: number; denyNeeded: number; ruleLabel: string };
};
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertTriangle,
  Radio,
  Search,
  ScrollText,
  Shield,
  ShieldOff,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
  Download,
  Upload,
  Database,
  CheckCircle,
  XCircle,
  Loader2,
  Gavel,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  applyFeedbackFilters,
  buildFeedbackCsv,
  type FeedbackInboxItem,
  feedbackChannelLabel,
  type FeedbackPriorityFilter,
  type FeedbackReviewedFilter,
  type FeedbackReviewerFilter,
  type FeedbackSort,
} from "@/lib/feedback-inbox-utils";

type UsageOverview = {
  latest: {
    requests: number;
    errors: number;
    errorRate: number;
    p95Ms: number;
    dbStorageMb: number;
    taskCount: number;
    attachmentBytes: number;
    spendMtdCents: number;
  };
  series: Array<{ snapshotDate: string }>;
};

type StorageOverview = {
  policy: {
    maxTasks: number;
    maxAttachmentCount: number;
    maxAttachmentBytes: number;
  };
  usage: {
    taskCount: number;
    attachmentCount: number;
    attachmentBytes: number;
  };
  warnings: {
    task: number;
    attachmentCount: number;
    attachmentBytes: number;
  };
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: string;
  confirmationNumber?: string | null;
  createdAt?: string | null;
};

type SecurityEventRow = {
  id: string;
  eventType: string;
  actorUserId?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  ipAddress?: string | null;
  createdAt?: string | null;
  payloadJson?: string | null;
};

type SecurityAlertRow = {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  status: string;
  createdAt?: string | null;
};

type AdminAnalyticsOverview = {
  generatedAt: string;
  totals: {
    users: number;
    tasks: number;
    completedTasks: number;
    completionRate: number;
    feedbackProcessed: number;
    urgentFeedback: number;
  };
  completionTrend: Array<{ date: string; completed: number }>;
  pulseByHour: Array<{ hour: string; requests: number }>;
  feedbackPriorityDistribution: Array<{ priority: string; count: number }>;
  topClassifications: Array<{ classification: string; count: number }>;
  signals: Array<{
    key: string;
    label: string;
    value: number;
    unit: string;
    tone: "positive" | "warning" | "neutral";
  }>;
  pretext: string[];
};

function formatCurrency(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents || 0) / 100);
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [banTarget, setBanTarget] = useState<SafeUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [lifetimeGrantUser, setLifetimeGrantUser] = useState<AdminUserRow | null>(null);
  const [grantProduct, setGrantProduct] = useState<"axtask" | "nodeweaver" | "bundle">("axtask");
  const [grantType, setGrantType] = useState<"beta_tester" | "patron" | "manual">("beta_tester");
  const [grantReason, setGrantReason] = useState("");
  const [lifetimeRevokeUser, setLifetimeRevokeUser] = useState<AdminUserRow | null>(null);
  const [revokeProduct, setRevokeProduct] = useState<"axtask" | "nodeweaver" | "bundle">("axtask");
  const [revokeReason, setRevokeReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("0");
  const [feedbackPriorityFilter, setFeedbackPriorityFilter] =
    useState<FeedbackPriorityFilter>("all");
  const [feedbackTagFilter, setFeedbackTagFilter] = useState("");
  const [feedbackReviewedFilter, setFeedbackReviewedFilter] =
    useState<FeedbackReviewedFilter>("all");
  const [feedbackSort, setFeedbackSort] = useState<FeedbackSort>("newest");
  const [feedbackReviewerFilter, setFeedbackReviewerFilter] =
    useState<FeedbackReviewerFilter>("all");
  const [feedbackPresetName, setFeedbackPresetName] = useState("");
  const [commandCenterMode, setCommandCenterMode] = useState(false);
  const [incidentTickerIndex, setIncidentTickerIndex] = useState(0);

  const FEEDBACK_PRESETS_KEY = "axtask.feedbackInbox.presets";

  const [importResult, setImportResult] = useState<any>(null);
  const [importBundle, setImportBundle] = useState<any>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importMode, setImportMode] = useState<"preserve" | "remap">("preserve");
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [adminStepCode, setAdminStepCode] = useState("");
  const [adminStepChallengeId, setAdminStepChallengeId] = useState<string | null>(null);
  const [adminStepMasked, setAdminStepMasked] = useState<string | null>(null);

  const { data: stepUpStatus, isLoading: stepUpLoading } = useQuery<{
    stepUpRequired: boolean;
    stepUpSatisfied: boolean;
    expiresAt: number | null;
  }>({
    queryKey: ["/api/admin/step-up-status"],
    enabled: user?.role === "admin",
  });

  const adminApiEnabled =
    user?.role === "admin" && !stepUpLoading && Boolean(stepUpStatus?.stepUpSatisfied);

  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUserRow[]>({
    queryKey: ["/api/admin/users"],
    enabled: adminApiEnabled,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<SecurityLog[]>({
    queryKey: ["/api/admin/security-logs"],
    enabled: adminApiEnabled,
  });

  const { data: usage } = useQuery<UsageOverview>({
    queryKey: ["/api/admin/usage"],
    enabled: adminApiEnabled,
  });

  const { data: storage } = useQuery<StorageOverview>({
    queryKey: ["/api/admin/storage"],
    enabled: adminApiEnabled,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    enabled: adminApiEnabled,
  });

  const { data: securityEvents = [] } = useQuery<SecurityEventRow[]>({
    queryKey: ["/api/admin/security-events"],
    enabled: adminApiEnabled,
    refetchInterval: 15000,
  });

  const { data: securityAlerts = [] } = useQuery<SecurityAlertRow[]>({
    queryKey: ["/api/admin/security-alerts"],
    enabled: adminApiEnabled,
  });

  const { data: feedbackInbox = [] } = useQuery<FeedbackInboxItem[]>({
    queryKey: ["/api/admin/feedback-inbox"],
    enabled: adminApiEnabled,
  });

  const { data: adminAppeals = [], isLoading: appealsLoading } = useQuery<AdminAppealRow[]>({
    queryKey: ["/api/admin/appeals"],
    enabled: adminApiEnabled,
  });

  const { data: liveAnalytics } = useQuery<AdminAnalyticsOverview>({
    queryKey: ["/api/admin/analytics/overview"],
    enabled: adminApiEnabled,
    refetchInterval: 15000,
  });

  const previousTotalsRef = useRef<AdminAnalyticsOverview["totals"] | null>(null);
  const [liveDelta, setLiveDelta] = useState({
    tasks: 0,
    completionRate: 0,
    urgentFeedback: 0,
    feedbackProcessed: 0,
  });

  useEffect(() => {
    if (!liveAnalytics?.totals) return;
    const prev = previousTotalsRef.current;
    if (prev) {
      setLiveDelta({
        tasks: liveAnalytics.totals.tasks - prev.tasks,
        completionRate: liveAnalytics.totals.completionRate - prev.completionRate,
        urgentFeedback: liveAnalytics.totals.urgentFeedback - prev.urgentFeedback,
        feedbackProcessed: liveAnalytics.totals.feedbackProcessed - prev.feedbackProcessed,
      });
    }
    previousTotalsRef.current = liveAnalytics.totals;
  }, [liveAnalytics]);

  const requestPulseDelta = useMemo(() => {
    if (!liveAnalytics || liveAnalytics.pulseByHour.length < 2) return 0;
    const points = liveAnalytics.pulseByHour;
    return points[points.length - 1].requests - points[points.length - 2].requests;
  }, [liveAnalytics]);

  const liveRequestNow = useMemo(() => {
    if (!liveAnalytics || liveAnalytics.pulseByHour.length === 0) return 0;
    return liveAnalytics.pulseByHour[liveAnalytics.pulseByHour.length - 1].requests;
  }, [liveAnalytics]);

  const incidentTickerItems = useMemo(() => {
    return securityEvents
      .filter((event) =>
        event.eventType.includes("failed") ||
        event.eventType.includes("alert") ||
        event.eventType.includes("security") ||
        (event.statusCode || 0) >= 400,
      )
      .slice(0, 50)
      .map((event) => {
        const at = event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : "n/a";
        const where = `${event.method || "N/A"} ${event.route || "-"}`;
        return `${at} · ${event.eventType} · ${where} · status ${event.statusCode ?? "n/a"}`;
      });
  }, [securityEvents]);

  useEffect(() => {
    if (incidentTickerItems.length === 0) return;
    const timer = setInterval(() => {
      setIncidentTickerIndex((idx) => (idx + 1) % incidentTickerItems.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [incidentTickerItems]);

  useEffect(() => {
    if (!commandCenterMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommandCenterMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandCenterMode]);

  const animatedTasks = useCountUp(liveAnalytics?.totals.tasks ?? 0, 700);
  const animatedCompletionRate = useCountUp(liveAnalytics?.totals.completionRate ?? 0, 700);
  const animatedUrgentFeedback = useCountUp(liveAnalytics?.totals.urgentFeedback ?? 0, 700);
  const animatedLiveRequests = useCountUp(liveRequestNow, 700);

  const feedbackReviewMutation = useMutation({
    mutationFn: async ({ feedbackEventId, reviewed }: { feedbackEventId: string; reviewed: boolean }) => {
      await apiRequest("POST", `/api/admin/feedback-inbox/${feedbackEventId}/review`, { reviewed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback-inbox"] });
      toast({ title: "Feedback updated", description: "Review state has been saved." });
    },
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const appealVoteMutation = useMutation({
    mutationFn: async (payload: { appealId: string; decision: "grant" | "deny" }) => {
      const res = await apiRequest("POST", `/api/admin/appeals/${payload.appealId}/vote`, {
        decision: payload.decision,
      });
      return res.json() as Promise<{
        status: string;
        outcome?: string;
        autoUnbanned?: boolean;
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appeals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const desc =
        data.outcome && data.outcome !== "pending"
          ? `Appeal ${data.outcome}${data.autoUnbanned ? " · account unbanned" : ""}`
          : "Awaiting further admin votes.";
      toast({ title: "Vote recorded", description: desc });
    },
    onError: (err: Error) =>
      toast({ title: "Vote failed", description: err.message, variant: "destructive" }),
  });

  const feedbackBulkReviewMutation = useMutation({
    mutationFn: async ({ feedbackEventIds, reviewed }: { feedbackEventIds: string[]; reviewed: boolean }) => {
      await apiRequest("POST", "/api/admin/feedback-inbox/review-bulk", {
        feedbackEventIds,
        reviewed,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback-inbox"] });
      toast({ title: "Feedback updated", description: "Bulk review state has been saved." });
    },
    onError: (err: Error) =>
      toast({ title: "Bulk update failed", description: err.message, variant: "destructive" }),
  });

  const analyzeAlertsMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/security-alerts/analyze", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-alerts"] });
      toast({ title: "Security analysis complete", description: "Latest anomaly rules were evaluated." });
    },
    onError: (err: Error) => toast({ title: "Analysis failed", description: err.message, variant: "destructive" }),
  });

  const captureMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/usage/capture", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/storage"] });
      toast({ title: "Usage captured", description: "A fresh usage snapshot has been stored." });
    },
    onError: (err: Error) => toast({ title: "Capture failed", description: err.message, variant: "destructive" }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        "/api/invoices",
        {
          invoiceNumber,
          amountCents: Number(invoiceAmount),
          currency: "USD",
        },
        { "x-idempotency-key": `${invoiceNumber}-${Date.now()}` },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created", description: "Invoice draft created successfully." });
      setInvoiceNumber("");
      setInvoiceAmount("0");
    },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/ban`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-logs"] });
      toast({ title: "User banned", description: "The user account has been suspended." });
      setBanTarget(null);
      setBanReason("");
    },
    onError: (err: Error) => {
      toast({ title: "Ban failed", description: err.message || "Could not ban user", variant: "destructive" });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/unban`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-logs"] });
      toast({ title: "User unbanned", description: "The user account has been restored." });
    },
    onError: (err: Error) => {
      toast({ title: "Unban failed", description: err.message || "Could not unban user", variant: "destructive" });
    },
  });

  const lifetimeGrantMutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      product: "axtask" | "nodeweaver" | "bundle";
      grantType: "beta_tester" | "patron" | "manual";
      reason: string;
    }) => {
      const res = await apiRequest("POST", `/api/admin/users/${payload.userId}/premium/lifetime-grant`, {
        product: payload.product,
        grantType: payload.grantType,
        reason: payload.reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-logs"] });
      setLifetimeGrantUser(null);
      setGrantReason("");
      toast({ title: "Lifetime access granted", description: "Logged to premium_events and security log." });
    },
    onError: (err: Error) => {
      toast({ title: "Grant failed", description: err.message, variant: "destructive" });
    },
  });

  const lifetimeRevokeMutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      product: "axtask" | "nodeweaver" | "bundle";
      reason: string;
    }) => {
      const res = await apiRequest("POST", `/api/admin/users/${payload.userId}/premium/lifetime-revoke`, {
        product: payload.product,
        reason: payload.reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-logs"] });
      setLifetimeRevokeUser(null);
      setRevokeReason("");
      toast({ title: "Lifetime access revoked", description: "Logged to premium_events and security log." });
    },
    onError: (err: Error) => {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (userId?: string) => {
      const res = await apiRequest("POST", "/api/admin/export", userId ? { userId } : {});
      return res.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const mode = data.metadata?.exportMode === "user" ? "user" : "full";
      a.href = url;
      a.download = `axtask-export-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `${Object.values(data.metadata.tableCounts as Record<string, number>).reduce((a: number, b: number) => a + b, 0)} records exported` });
    },
    onError: (err: Error) => {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ bundle, dryRun, mode }: { bundle: any; dryRun: boolean; mode?: string }) => {
      const res = await apiRequest("POST", "/api/admin/import", { bundle, dryRun, mode: mode || "preserve" });
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      if (!data.dryRun && data.success) {
        toast({ title: "Import complete", description: `${Object.values(data.inserted as Record<string, number>).reduce((a: number, b: number) => a + b, 0)} records imported` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/security-logs"] });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const adminStepUpSendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mfa/challenge", {
        purpose: MFA_PURPOSES.ADMIN_STEP_UP,
        channel: "email",
      });
      return res.json() as Promise<{
        challengeId: string;
        maskedDestination?: string;
        devCode?: string;
      }>;
    },
    onSuccess: (data) => {
      setAdminStepChallengeId(data.challengeId);
      setAdminStepMasked(data.maskedDestination ?? null);
      setAdminStepCode("");
      toast({
        title: "Code sent",
        description: data.devCode
          ? `Dev code: ${data.devCode}`
          : `Check ${data.maskedDestination ?? "your email"} for a 6-digit code.`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not send code", description: err.message, variant: "destructive" }),
  });

  const adminStepUpVerifyMutation = useMutation({
    mutationFn: async () => {
      if (!adminStepChallengeId) throw new Error("Request a code first");
      const res = await apiRequest("POST", "/api/admin/step-up", {
        challengeId: adminStepChallengeId,
        code: adminStepCode.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/step-up-status"] });
      setAdminStepChallengeId(null);
      setAdminStepCode("");
      setAdminStepMasked(null);
      toast({ title: "Verified", description: "Admin session is active for one hour." });
    },
    onError: (err: Error) =>
      toast({ title: "Verification failed", description: err.message, variant: "destructive" }),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (!parsed.metadata || !parsed.data) {
          toast({ title: "Invalid file", description: "This doesn't look like an AxTask export file", variant: "destructive" });
          setImportBundle(null);
          return;
        }
        setImportBundle(parsed);
        toast({ title: "File loaded", description: `${file.name} ready for import. Run a dry-run first to validate.` });
      } catch {
        toast({ title: "Parse error", description: "Could not parse JSON file", variant: "destructive" });
        setImportBundle(null);
      }
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    if (!lifetimeRevokeUser) return;
    const g = lifetimeRevokeUser.lifetimePremiumGrants?.[0];
    if (g && (g.product === "axtask" || g.product === "nodeweaver" || g.product === "bundle")) {
      setRevokeProduct(g.product);
    }
    setRevokeReason("");
  }, [lifetimeRevokeUser]);

  useEffect(() => {
    if (lifetimeGrantUser) {
      setGrantReason("");
    }
  }, [lifetimeGrantUser]);

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.displayName || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  const bannedCount = users.filter((u) => u.isBanned).length;
  const sortedFeedback = applyFeedbackFilters(
    feedbackInbox,
    {
      priority: feedbackPriorityFilter,
      reviewed: feedbackReviewedFilter,
      reviewer: feedbackReviewerFilter,
      tagQuery: feedbackTagFilter,
      sort: feedbackSort,
    },
    user?.id,
  );

  const exportFilteredFeedbackCsv = () => {
    const csv = buildFeedbackCsv(sortedFeedback);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `feedback-inbox-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getFeedbackPresets = (): Array<{ name: string; filters: {
    priority: FeedbackPriorityFilter;
    reviewed: FeedbackReviewedFilter;
    reviewer: FeedbackReviewerFilter;
    tagQuery: string;
    sort: FeedbackSort;
  } }> => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FEEDBACK_PRESETS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const [feedbackPresets, setFeedbackPresets] = useState(getFeedbackPresets);

  const saveFeedbackPreset = () => {
    const trimmed = feedbackPresetName.trim();
    if (!trimmed) return;
    const next = [
      {
        name: trimmed,
        filters: {
          priority: feedbackPriorityFilter,
          reviewed: feedbackReviewedFilter,
          reviewer: feedbackReviewerFilter,
          tagQuery: feedbackTagFilter,
          sort: feedbackSort,
        },
      },
      ...feedbackPresets.filter((preset) => preset.name !== trimmed),
    ].slice(0, 10);
    localStorage.setItem(FEEDBACK_PRESETS_KEY, JSON.stringify(next));
    setFeedbackPresets(next);
    setFeedbackPresetName("");
    toast({ title: "Preset saved", description: `Saved "${trimmed}" filter preset.` });
  };

  const applyFeedbackPreset = (name: string) => {
    const preset = feedbackPresets.find((p) => p.name === name);
    if (!preset) return;
    setFeedbackPriorityFilter(preset.filters.priority);
    setFeedbackReviewedFilter(preset.filters.reviewed);
    setFeedbackReviewerFilter(preset.filters.reviewer);
    setFeedbackTagFilter(preset.filters.tagQuery);
    setFeedbackSort(preset.filters.sort);
  };

  const renderDeltaBadge = (delta: number, inverse = false) => {
    if (delta === 0) {
      return <Badge variant="outline">stable</Badge>;
    }
    const improved = inverse ? delta < 0 : delta > 0;
    return (
      <Badge variant={improved ? "secondary" : "destructive"}>
        {improved ? "+" : ""}{delta}
      </Badge>
    );
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You need administrator privileges to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stepUpLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Checking admin session…</p>
      </div>
    );
  }

  if (stepUpStatus?.stepUpRequired && !stepUpStatus.stepUpSatisfied) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Confirm admin access
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Production requires a one-time email code before admin tools load. This expires after one hour.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              className="w-full"
              variant="secondary"
              disabled={adminStepUpSendMutation.isPending}
              onClick={() => adminStepUpSendMutation.mutate()}
            >
              {adminStepUpSendMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                "Email me a code"
              )}
            </Button>
            {adminStepMasked ? (
              <p className="text-xs text-muted-foreground text-center">Sent to {adminStepMasked}</p>
            ) : null}
            <div>
              <Label htmlFor="admin-step-code">6-digit code</Label>
              <Input
                id="admin-step-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={adminStepCode}
                onChange={(e) => setAdminStepCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1 font-mono tracking-widest"
                placeholder="000000"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={
                adminStepUpVerifyMutation.isPending || adminStepCode.length !== 6 || !adminStepChallengeId
              }
              onClick={() => adminStepUpVerifyMutation.mutate()}
            >
              {adminStepUpVerifyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify and continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold dark:text-white">Security & Operations Admin</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div><p className="text-2xl font-bold dark:text-white">{users.length}</p><p className="text-sm text-muted-foreground">Total Users</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldOff className="h-5 w-5 text-red-500" />
              <div><p className="text-2xl font-bold dark:text-white">{bannedCount}</p><p className="text-sm text-muted-foreground">Banned Users</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ScrollText className="h-5 w-5 text-green-500" />
              <div><p className="text-2xl font-bold dark:text-white">{logs.length}</p><p className="text-sm text-muted-foreground">Security Events</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-purple-500" />
              <div><p className="text-2xl font-bold dark:text-white">{invoices.length}</p><p className="text-sm text-muted-foreground">Invoices</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="live">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="live">Live Analytics</TabsTrigger>
          <TabsTrigger value="usage">Usage & Storage</TabsTrigger>
          <TabsTrigger value="intel">Security Intelligence</TabsTrigger>
          <TabsTrigger value="feedback">Feedback Inbox</TabsTrigger>
          <TabsTrigger value="appeals">Appeals</TabsTrigger>
          <TabsTrigger value="invoices">Invoicing</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="logs">Security Logs</TabsTrigger>
          <TabsTrigger value="migration">Data Migration</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
              Live mode refreshes every 15 seconds
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {liveAnalytics?.generatedAt ? `Updated ${new Date(liveAnalytics.generatedAt).toLocaleTimeString()}` : "Waiting for data"}
              </Badge>
              <Button size="sm" onClick={() => setCommandCenterMode(true)} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                Command Center Mode
              </Button>
            </div>
          </div>

          <Card className="border-blue-300/50 bg-gradient-to-r from-blue-50/70 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Incident Timeline Ticker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-background/70 px-3 py-2 font-mono text-xs transition-all duration-500">
                {incidentTickerItems.length > 0 ? incidentTickerItems[incidentTickerIndex] : "No active incident timeline events."}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="ring-1 ring-blue-400/20 shadow-md shadow-blue-400/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{animatedTasks}</p>
                    <p className="text-sm text-muted-foreground">Total tasks (global)</p>
                    <div className="mt-1">{renderDeltaBadge(liveDelta.tasks)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="ring-1 ring-emerald-400/20 shadow-md shadow-emerald-400/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{animatedCompletionRate}%</p>
                    <p className="text-sm text-muted-foreground">Completion rate</p>
                    <div className="mt-1">{renderDeltaBadge(liveDelta.completionRate)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="ring-1 ring-rose-400/20 shadow-md shadow-rose-400/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{animatedUrgentFeedback}</p>
                    <p className="text-sm text-muted-foreground">Urgent feedback items</p>
                    <div className="mt-1">{renderDeltaBadge(liveDelta.urgentFeedback, true)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="ring-1 ring-amber-400/20 shadow-md shadow-amber-400/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  {requestPulseDelta >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-amber-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-emerald-500" />
                  )}
                  <div>
                    <p className="text-2xl font-bold">{animatedLiveRequests}</p>
                    <p className="text-sm text-muted-foreground">Requests this hour</p>
                    <div className="mt-1">{renderDeltaBadge(requestPulseDelta)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pretext Live Briefing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(liveAnalytics?.pretext ?? []).map((line) => (
                <div key={line} className="rounded border bg-muted/30 px-3 py-2 text-sm">
                  {line}
                </div>
              ))}
              {!liveAnalytics && <p className="text-sm text-muted-foreground">Building live briefing...</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operational Signals</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {(liveAnalytics?.signals ?? []).map((signal) => (
                <div key={signal.key} className="rounded border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{signal.label}</p>
                  <p className="text-xl font-semibold mt-1">
                    {signal.value}
                    <span className="text-xs font-normal ml-1 text-muted-foreground">{signal.unit}</span>
                  </p>
                  <Badge
                    variant={
                      signal.tone === "positive"
                        ? "secondary"
                        : signal.tone === "warning"
                        ? "destructive"
                        : "outline"
                    }
                    className="mt-2"
                  >
                    {signal.tone}
                  </Badge>
                </div>
              ))}
              {!liveAnalytics && <p className="text-sm text-muted-foreground">Calculating signals...</p>}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Completed Tasks Trend</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer
                  className="h-[260px] w-full"
                  config={{ completed: { label: "Completed", color: "#22c55e" } }}
                >
                  <LineChart data={liveAnalytics?.completionTrend ?? []}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>API Request Pulse (24h)</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer
                  className="h-[260px] w-full"
                  config={{ requests: { label: "Requests", color: "#3b82f6" } }}
                >
                  <BarChart data={liveAnalytics?.pulseByHour ?? []}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="hour" tickFormatter={(v) => String(v).slice(11, 16)} />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="requests" fill="var(--color-requests)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Feedback Priority Mix</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer
                  className="h-[260px] w-full"
                  config={{ count: { label: "Feedback", color: "#f97316" } }}
                >
                  <BarChart data={liveAnalytics?.feedbackPriorityDistribution ?? []}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="priority" />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top Task Classifications</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(liveAnalytics?.topClassifications ?? []).map((item) => (
                  <div key={item.classification} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{item.classification}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
                {!liveAnalytics && <p className="text-sm text-muted-foreground">Loading classifications...</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => captureMutation.mutate()} disabled={captureMutation.isPending}>Capture Snapshot</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Requests</p><p className="text-2xl font-bold">{usage?.latest.requests ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Error Rate</p><p className="text-2xl font-bold">{usage?.latest.errorRate ?? 0}%</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">p95 latency</p><p className="text-2xl font-bold">{usage?.latest.p95Ms ?? 0}ms</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">DB Storage</p><p className="text-2xl font-bold">{usage?.latest.dbStorageMb ?? 0} MB</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Task Count</p><p className="text-2xl font-bold">{usage?.latest.taskCount ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Attachment MB</p><p className="text-2xl font-bold">{((usage?.latest.attachmentBytes ?? 0) / 1024 / 1024).toFixed(2)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Storage policy</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Tasks: {storage?.usage.taskCount ?? 0} / {storage?.policy.maxTasks ?? 0} ({storage?.warnings.task ?? 0}%)</p>
              <p>Attachments: {storage?.usage.attachmentCount ?? 0} / {storage?.policy.maxAttachmentCount ?? 0} ({storage?.warnings.attachmentCount ?? 0}%)</p>
              <p>Attachment bytes: {storage?.usage.attachmentBytes ?? 0} / {storage?.policy.maxAttachmentBytes ?? 0} ({storage?.warnings.attachmentBytes ?? 0}%)</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Create invoice</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              <Input placeholder="Amount (cents)" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
              <Button onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending || !invoiceNumber.trim()}>
                {createInvoiceMutation.isPending ? "Creating..." : "Create Draft"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded border px-3 py-2">
                  <div>
                    <p className="font-medium">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{inv.status} · {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : "n/a"}</p>
                  </div>
                  <Badge variant="secondary">{formatCurrency(inv.amountCents, inv.currency)}</Badge>
                </div>
              ))}
              {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="intel" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => analyzeAlertsMutation.mutate()} disabled={analyzeAlertsMutation.isPending}>
              {analyzeAlertsMutation.isPending ? "Analyzing..." : "Run anomaly analysis"}
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Open security alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {securityAlerts.map((alert) => (
                <div key={alert.id} className="rounded border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{alert.message}</span>
                    <Badge variant={alert.severity === "high" || alert.severity === "critical" ? "destructive" : "secondary"}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{alert.ruleId} · {alert.status} · {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : "n/a"}</p>
                </div>
              ))}
              {securityAlerts.length === 0 && <p className="text-sm text-muted-foreground">No active alerts.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Security event stream</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[360px] overflow-auto">
              {securityEvents.slice(0, 120).map((event) => (
                <div key={event.id} className="rounded border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{event.eventType}</span>
                    <Badge variant="outline">{event.statusCode ?? "n/a"}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    {(event.method || "N/A")} {event.route || "-"} · {event.ipAddress || "unknown ip"} · {event.createdAt ? new Date(event.createdAt).toLocaleString() : "n/a"}
                  </p>
                </div>
              ))}
              {securityEvents.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={feedbackPriorityFilter}
                onChange={(e) =>
                  setFeedbackPriorityFilter(e.target.value as FeedbackPriorityFilter)
                }
              >
                <option value="all">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={feedbackReviewedFilter}
                onChange={(e) =>
                  setFeedbackReviewedFilter(e.target.value as FeedbackReviewedFilter)
                }
              >
                <option value="all">All review states</option>
                <option value="reviewed">Reviewed</option>
                <option value="unreviewed">Unreviewed</option>
              </select>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={feedbackReviewerFilter}
                onChange={(e) =>
                  setFeedbackReviewerFilter(e.target.value as FeedbackReviewerFilter)
                }
              >
                <option value="all">All reviewers</option>
                <option value="me">Reviewed by me</option>
                <option value="others">Reviewed by others</option>
              </select>
              <Input
                placeholder="Filter by tag (e.g. bug)"
                value={feedbackTagFilter}
                onChange={(e) => setFeedbackTagFilter(e.target.value)}
              />
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={feedbackSort}
                onChange={(e) => setFeedbackSort(e.target.value as FeedbackSort)}
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="critical-first">Sort: Critical First</option>
              </select>
              <div className="flex gap-2">
                <Input
                  placeholder="Preset name"
                  value={feedbackPresetName}
                  onChange={(e) => setFeedbackPresetName(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={saveFeedbackPreset}>
                  Save Preset
                </Button>
              </div>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value=""
                onChange={(e) => applyFeedbackPreset(e.target.value)}
              >
                <option value="" disabled>Load preset...</option>
                {feedbackPresets.map((preset) => (
                  <option key={preset.name} value={preset.name}>{preset.name}</option>
                ))}
              </select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Processed feedback triage inbox ({sortedFeedback.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[560px] overflow-auto">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sortedFeedback.length === 0 || feedbackBulkReviewMutation.isPending}
                  onClick={() =>
                    feedbackBulkReviewMutation.mutate({
                      feedbackEventIds: sortedFeedback.map((item) => item.id),
                      reviewed: true,
                    })
                  }
                >
                  Mark All Filtered Reviewed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sortedFeedback.length === 0 || feedbackBulkReviewMutation.isPending}
                  onClick={() =>
                    feedbackBulkReviewMutation.mutate({
                      feedbackEventIds: sortedFeedback.map((item) => item.id),
                      reviewed: false,
                    })
                  }
                >
                  Mark All Filtered Unreviewed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sortedFeedback.length === 0}
                  onClick={exportFilteredFeedbackCsv}
                >
                  Export Filtered CSV
                </Button>
              </div>
              {sortedFeedback.map((item) => (
                <div key={item.id} className="rounded border px-3 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.priority === "critical" || item.priority === "high" ? "destructive" : "secondary"}>
                      {item.priority}
                    </Badge>
                    <Badge variant="outline">{item.classification}</Badge>
                    <Badge variant="outline">{item.sentiment}</Badge>
                    {item.channel ? (
                      <Badge variant="outline" className="font-normal">
                        {feedbackChannelLabel(item.channel)}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : "n/a"}
                    </span>
                    {item.reviewed ? (
                      <Badge variant="secondary">Reviewed</Badge>
                    ) : (
                      <Badge variant="outline">Unreviewed</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    user: {item.actorUserId || (item.channel === "public_contact" ? "anonymous" : "unknown")} · message
                    chars: {item.messageLength} · attachments: {item.attachments}
                    {item.reporterEmail ? (
                      <>
                        {" "}
                        · reply-to: <span className="font-mono">{item.reporterEmail}</span>
                      </>
                    ) : null}
                    {item.reporterName ? (
                      <>
                        {" "}
                        · name: {item.reporterName}
                      </>
                    ) : null}
                  </p>
                  {item.message ? (
                    <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">{item.message}</p>
                  ) : null}
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <Badge key={`${item.id}-${tag}`} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  {item.recommendedActions.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                      {item.recommendedActions.map((action) => (
                        <li key={`${item.id}-${action}`}>{action}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    classifier: {item.classifierSource} · fallback layer {item.classifierFallbackLayer} · confidence {(item.classifierConfidence * 100).toFixed(0)}%
                  </p>
                  {item.reviewed && (
                    <p className="text-xs text-muted-foreground">
                      reviewed by: {item.reviewedBy || "unknown"} · {item.reviewedAt ? new Date(item.reviewedAt).toLocaleString() : "n/a"}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant={item.reviewed ? "outline" : "default"}
                      disabled={feedbackReviewMutation.isPending}
                      onClick={() =>
                        feedbackReviewMutation.mutate({
                          feedbackEventId: item.id,
                          reviewed: !item.reviewed,
                        })
                      }
                    >
                      {item.reviewed ? "Mark Unreviewed" : "Mark Reviewed"}
                    </Button>
                  </div>
                </div>
              ))}
              {sortedFeedback.length === 0 && (
                <p className="text-sm text-muted-foreground">No processed feedback events yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appeals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gavel className="h-5 w-5" />
                Appeals queue
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Voting rules: one admin decides alone; two admins must agree (unanimous); three or more require a
                two-thirds supermajority to grant or deny. Granting a ban appeal lifts the suspension automatically.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {appealsLoading ? (
                <p className="text-sm text-muted-foreground">Loading appeals…</p>
              ) : adminAppeals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appeals yet.</p>
              ) : (
                adminAppeals.map((a) => (
                  <div key={a.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.title}</span>
                      <Badge variant="outline">{a.subjectType}</Badge>
                      <Badge variant={a.status === "open" ? "default" : "secondary"}>{a.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{a.id}</p>
                    <p className="text-xs text-muted-foreground">
                      Appellant: <span className="font-mono">{a.appellantUserId}</span> · ref:{" "}
                      <span className="font-mono break-all">{a.subjectRef}</span>
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-muted-foreground">{a.threshold.ruleLabel}</p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge variant="secondary">Grant votes: {a.grantVotes} / {a.threshold.grantNeeded}</Badge>
                      <Badge variant="secondary">Deny votes: {a.denyVotes} / {a.threshold.denyNeeded}</Badge>
                    </div>
                    {a.status === "open" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={appealVoteMutation.isPending}
                          onClick={() => appealVoteMutation.mutate({ appealId: a.id, decision: "grant" })}
                        >
                          Vote grant
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={appealVoteMutation.isPending}
                          onClick={() => appealVoteMutation.mutate({ appealId: a.id, decision: "deny" })}
                        >
                          Vote deny
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{a.resolution || "Resolved."}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {usersLoading ? (
            <p className="text-muted-foreground">Loading users...</p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <Card key={u.id} className={u.isBanned ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20" : ""}>
                  <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate dark:text-white">{u.displayName || u.email}</p>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">{u.role}</Badge>
                        {u.isBanned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                      {(u.lifetimePremiumGrants ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(u.lifetimePremiumGrants ?? []).map((g) => (
                            <Badge key={`${u.id}-${g.planKey}`} variant="outline" className="text-xs border-amber-500/50 text-amber-800 dark:text-amber-200">
                              {g.product} · lifetime
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setGrantProduct("axtask");
                          setGrantType("beta_tester");
                          setLifetimeGrantUser(u);
                        }}
                        disabled={lifetimeGrantMutation.isPending}
                      >
                        Grant lifetime…
                      </Button>
                      {(u.lifetimePremiumGrants ?? []).length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLifetimeRevokeUser(u)}
                          disabled={lifetimeRevokeMutation.isPending}
                        >
                          Revoke lifetime…
                        </Button>
                      )}
                      {u.role !== "admin" && u.id !== user?.id && (
                        u.isBanned ? (
                          <Button size="sm" variant="outline" onClick={() => unbanMutation.mutate(u.id)} disabled={unbanMutation.isPending}>Unban</Button>
                        ) : (
                          <Button size="sm" variant="destructive" onClick={() => { setBanTarget(u); setBanReason(""); }}>Ban</Button>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {logsLoading ? (
            <p className="text-muted-foreground">Loading security logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No security events logged yet</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/50 text-sm">
                  <Badge variant={log.eventType.includes("failed") ? "destructive" : "secondary"} className="text-xs shrink-0 mt-0.5">{log.eventType}</Badge>
                  <div className="min-w-0 flex-1">
                    {log.details && <p className="text-muted-foreground truncate">{log.details}</p>}
                    <p className="text-xs text-muted-foreground">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      {log.ipAddress && ` · ${log.ipAddress}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="migration" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Download className="h-5 w-5 text-blue-500" />
                  Export Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download a complete backup of all database tables as a portable JSON file.
                  Includes users, tasks, rewards, patterns, classifications, and all related data.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => exportMutation.mutate(undefined)}
                    disabled={exportMutation.isPending}
                    className="w-full"
                  >
                    {exportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Export Full Database
                  </Button>
                </div>
                <div className="border-t pt-4 dark:border-gray-700">
                  <p className="text-sm font-medium mb-2 dark:text-white">Export Single User</p>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600"
                      id="export-user-select"
                      defaultValue=""
                    >
                      <option value="" disabled>Select a user...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName || u.email} ({u.email})
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      disabled={exportMutation.isPending}
                      onClick={() => {
                        const sel = document.getElementById("export-user-select") as HTMLSelectElement;
                        if (sel?.value) exportMutation.mutate(sel.value);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5 text-green-500" />
                  Import Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Restore data from an export file. Existing records with matching IDs will be skipped.
                  Always run a dry-run first to validate the data before importing.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importFileName || "Choose Export File (.json)"}
                </Button>

                {importBundle && (
                  <div className="space-y-3">
                    <div className="rounded-md bg-muted/50 dark:bg-gray-800 p-3 text-sm space-y-1">
                      <p className="font-medium dark:text-white">
                        {importBundle.metadata.exportMode === "user" ? "User Export" : "Full Database Export"}
                      </p>
                      <p className="text-muted-foreground">
                        Exported: {new Date(importBundle.metadata.exportedAt).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">
                        Total records: {Object.values(importBundle.metadata.tableCounts as Record<string, number>).reduce((a: number, b: number) => a + b, 0)}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(importBundle.metadata.tableCounts as Record<string, number>)
                          .filter(([, v]) => (v as number) > 0)
                          .map(([k, v]) => (
                            <Badge key={k} variant="secondary" className="text-xs">
                              {k}: {v as number}
                            </Badge>
                          ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium dark:text-white">Import Mode:</label>
                        <select
                          value={importMode}
                          onChange={(e) => setImportMode(e.target.value as "preserve" | "remap")}
                          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        >
                          <option value="preserve">Preserve IDs (skip existing)</option>
                          <option value="remap">Remap IDs (generate new)</option>
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {importMode === "preserve"
                          ? "Records with matching IDs in the database will be skipped."
                          : "All records get new IDs. Use this to duplicate data or import into a populated database."}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={importMutation.isPending}
                        onClick={() => importMutation.mutate({ bundle: importBundle, dryRun: true, mode: importMode })}
                      >
                        {importMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Dry Run (Validate)
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={importMutation.isPending}
                        onClick={() => setImportConfirmOpen(true)}
                      >
                        {importMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Import Now
                      </Button>
                    </div>
                  </div>
                )}

                {importResult && (
                  <div className={`rounded-md p-3 text-sm border ${
                    importResult.success
                      ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {importResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      )}
                      <p className="font-medium dark:text-white">
                        {importResult.dryRun ? "Dry Run Result" : "Import Result"}
                        {importResult.success ? " — Passed" : " — Issues Found"}
                      </p>
                    </div>

                    {Object.keys(importResult.inserted || {}).length > 0 && (
                      <div className="space-y-0.5 mb-2">
                        {Object.entries(importResult.inserted as Record<string, number>)
                          .filter(([, v]) => (v as number) > 0)
                          .map(([k, v]) => (
                            <p key={k} className="text-muted-foreground">
                              {k}: <span className="text-green-600 dark:text-green-400">{v as number} {importResult.dryRun ? "would be inserted" : "inserted"}</span>
                              {importResult.skipped?.[k] > 0 && (
                                <span className="text-yellow-600 dark:text-yellow-400 ml-2">({importResult.skipped[k]} skipped)</span>
                              )}
                            </p>
                          ))}
                      </div>
                    )}

                    {importResult.errors?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-red-600 dark:text-red-400 mb-1">Errors ({importResult.errors.length}):</p>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {importResult.errors.slice(0, 20).map((err: any, i: number) => (
                            <p key={i} className="text-xs text-red-600 dark:text-red-400">
                              [{err.table}#{err.rowIndex}] {err.field}: {err.message}
                            </p>
                          ))}
                          {importResult.errors.length > 20 && (
                            <p className="text-xs text-muted-foreground">...and {importResult.errors.length - 20} more</p>
                          )}
                        </div>
                      </div>
                    )}

                    {importResult.warnings?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">Warnings ({importResult.warnings.length}):</p>
                        <div className="max-h-24 overflow-y-auto space-y-0.5">
                          {importResult.warnings.slice(0, 10).map((w: any, i: number) => (
                            <p key={i} className="text-xs text-yellow-600 dark:text-yellow-400">
                              [{w.table}#{w.rowIndex}] {w.field}: {w.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {commandCenterMode && (
        <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm">
          <div className="h-full w-full overflow-auto p-6">
            <div className="mx-auto max-w-[1700px] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Command Center</h2>
                  <p className="text-sm text-muted-foreground">
                    Full-screen live operations view with continuous telemetry.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setCommandCenterMode(false)}>
                  <X className="h-4 w-4 mr-1" />
                  Exit (Esc)
                </Button>
              </div>

              <Card className="border-blue-300/50 bg-gradient-to-r from-blue-50/70 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
                <CardContent className="py-3 font-mono text-sm">
                  {incidentTickerItems.length > 0 ? incidentTickerItems[incidentTickerIndex] : "No active incident timeline events."}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="ring-1 ring-blue-400/20 shadow-md shadow-blue-400/10">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Total tasks (global)</p>
                    <p className="text-3xl font-bold">{animatedTasks}</p>
                  </CardContent>
                </Card>
                <Card className="ring-1 ring-emerald-400/20 shadow-md shadow-emerald-400/10">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Completion rate</p>
                    <p className="text-3xl font-bold">{animatedCompletionRate}%</p>
                  </CardContent>
                </Card>
                <Card className="ring-1 ring-rose-400/20 shadow-md shadow-rose-400/10">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Urgent feedback</p>
                    <p className="text-3xl font-bold">{animatedUrgentFeedback}</p>
                  </CardContent>
                </Card>
                <Card className="ring-1 ring-amber-400/20 shadow-md shadow-amber-400/10">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Requests this hour</p>
                    <p className="text-3xl font-bold">{animatedLiveRequests}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Completed Tasks Trend</CardTitle></CardHeader>
                  <CardContent>
                    <ChartContainer
                      className="h-[320px] w-full"
                      config={{ completed: { label: "Completed", color: "#22c55e" } }}
                    >
                      <LineChart data={liveAnalytics?.completionTrend ?? []}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>API Request Pulse (24h)</CardTitle></CardHeader>
                  <CardContent>
                    <ChartContainer
                      className="h-[320px] w-full"
                      config={{ requests: { label: "Requests", color: "#3b82f6" } }}
                    >
                      <BarChart data={liveAnalytics?.pulseByHour ?? []}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="hour" tickFormatter={(v) => String(v).slice(11, 16)} />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="requests" fill="var(--color-requests)" radius={4} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!banTarget} onOpenChange={(open) => !open && setBanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>Ban <strong>{banTarget?.displayName || banTarget?.email}</strong>? They will not be able to log in until unbanned.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Reason for ban (required)" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={banReason.trim().length < 3 || banMutation.isPending} onClick={() => banTarget && banMutation.mutate({ userId: banTarget.id, reason: banReason })}>Confirm Ban</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lifetimeGrantUser} onOpenChange={(open) => !open && setLifetimeGrantUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grant lifetime premium</DialogTitle>
            <DialogDescription>
              Creates an active complimentary subscription (no end date). Logged in <code className="text-xs">premium_events</code> as{" "}
              <code className="text-xs">admin_lifetime_granted</code> and in the security log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium dark:text-white">
              {lifetimeGrantUser?.displayName || lifetimeGrantUser?.email}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="grant-product">Product</label>
              <select
                id="grant-product"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600"
                value={grantProduct}
                onChange={(e) => setGrantProduct(e.target.value as "axtask" | "nodeweaver" | "bundle")}
              >
                <option value="axtask">AxTask</option>
                <option value="nodeweaver">NodeWeaver</option>
                <option value="bundle">Power Bundle</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="grant-type">Grant type</label>
              <select
                id="grant-type"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600"
                value={grantType}
                onChange={(e) => setGrantType(e.target.value as "beta_tester" | "patron" | "manual")}
              >
                <option value="beta_tester">Beta tester</option>
                <option value="patron">Patron / supporter</option>
                <option value="manual">Manual / other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="grant-reason">Reason (audit trail)</label>
              <Textarea
                id="grant-reason"
                placeholder="e.g. Early Docker beta feedback, referral from X, comp for outage…"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifetimeGrantUser(null)}>Cancel</Button>
            <Button
              disabled={grantReason.trim().length < 3 || !lifetimeGrantUser || lifetimeGrantMutation.isPending}
              onClick={() =>
                lifetimeGrantUser &&
                lifetimeGrantMutation.mutate({
                  userId: lifetimeGrantUser.id,
                  product: grantProduct,
                  grantType,
                  reason: grantReason.trim(),
                })
              }
            >
              Grant access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lifetimeRevokeUser} onOpenChange={(open) => !open && setLifetimeRevokeUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke lifetime premium</DialogTitle>
            <DialogDescription>
              Marks the lifetime plan inactive. Logged as <code className="text-xs">admin_lifetime_revoked</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium dark:text-white">
              {lifetimeRevokeUser?.displayName || lifetimeRevokeUser?.email}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="revoke-product">Product</label>
              <select
                id="revoke-product"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600"
                value={revokeProduct}
                onChange={(e) => setRevokeProduct(e.target.value as "axtask" | "nodeweaver" | "bundle")}
              >
                {(lifetimeRevokeUser?.lifetimePremiumGrants ?? []).map((g) => (
                  <option key={g.planKey} value={g.product}>
                    {g.product} ({g.planKey})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="revoke-reason">Reason (required)</label>
              <Textarea
                id="revoke-reason"
                placeholder="Why access is being removed…"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifetimeRevokeUser(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={revokeReason.trim().length < 3 || !lifetimeRevokeUser || lifetimeRevokeMutation.isPending}
              onClick={() =>
                lifetimeRevokeUser &&
                lifetimeRevokeMutation.mutate({
                  userId: lifetimeRevokeUser.id,
                  product: revokeProduct,
                  reason: revokeReason.trim(),
                })
              }
            >
              Revoke access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run database import?</DialogTitle>
            <DialogDescription>
              This writes to the database. Rows whose IDs already exist will be skipped. Use &quot;Dry Run&quot; first if
              you are unsure.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!importBundle || importMutation.isPending}
              onClick={() => {
                setImportConfirmOpen(false);
                if (importBundle) {
                  importMutation.mutate({ bundle: importBundle, dryRun: false, mode: importMode });
                }
              }}
            >
              Import now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
