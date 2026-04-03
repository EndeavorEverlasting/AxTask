import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { SafeUser, SecurityLog } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Search, ScrollText, Shield, ShieldOff, Users, Wallet } from "lucide-react";
import {
  applyFeedbackFilters,
  buildFeedbackCsv,
  type FeedbackInboxItem,
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

  const FEEDBACK_PRESETS_KEY = "axtask.feedbackInbox.presets";

  const { data: users = [], isLoading: usersLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.role === "admin",
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<SecurityLog[]>({
    queryKey: ["/api/admin/security-logs"],
    enabled: user?.role === "admin",
  });

  const { data: usage } = useQuery<UsageOverview>({
    queryKey: ["/api/admin/usage"],
    enabled: user?.role === "admin",
  });

  const { data: storage } = useQuery<StorageOverview>({
    queryKey: ["/api/admin/storage"],
    enabled: user?.role === "admin",
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    enabled: user?.role === "admin",
  });

  const { data: securityEvents = [] } = useQuery<SecurityEventRow[]>({
    queryKey: ["/api/admin/security-events"],
    enabled: user?.role === "admin",
  });

  const { data: securityAlerts = [] } = useQuery<SecurityAlertRow[]>({
    queryKey: ["/api/admin/security-alerts"],
    enabled: user?.role === "admin",
  });

  const { data: feedbackInbox = [] } = useQuery<FeedbackInboxItem[]>({
    queryKey: ["/api/admin/feedback-inbox"],
    enabled: user?.role === "admin",
  });

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

      <Tabs defaultValue="usage">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="usage">Usage & Storage</TabsTrigger>
          <TabsTrigger value="intel">Security Intelligence</TabsTrigger>
          <TabsTrigger value="feedback">Feedback Inbox</TabsTrigger>
          <TabsTrigger value="invoices">Invoicing</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="logs">Security Logs</TabsTrigger>
        </TabsList>

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
                    user: {item.actorUserId || "unknown"} · message chars: {item.messageLength} · attachments: {item.attachments}
                  </p>
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
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate dark:text-white">{u.displayName || u.email}</p>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">{u.role}</Badge>
                        {u.isBanned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className="flex gap-2">
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
                    <p className="text-xs text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}{log.ipAddress && ` · ${log.ipAddress}`}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
