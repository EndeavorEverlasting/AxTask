import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { SafeUser, SecurityLog } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield, ShieldOff, Users, ScrollText, AlertTriangle, Search,
  Download, Upload, Database, CheckCircle, XCircle, Loader2,
  Flag, Eye, Trash2, EyeOff, FileText, Filter, ClipboardList,
} from "lucide-react";

type EnrichedReport = {
  id: string;
  reporterId: string;
  postId: string | null;
  commentId: string | null;
  reason: string;
  status: string;
  note: string | null;
  createdAt: string | null;
  reporterName: string;
  contentBody: string;
  contentTitle: string | null;
  contentAuthorId: string | null;
  contentAuthorName: string;
};

type ModLogEntry = {
  id: string;
  moderatorId: string | null;
  moderatorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetSnippet: string;
  note: string | null;
  createdAt: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  hide_post: "Hidden post",
  hide_comment: "Hidden comment",
  delete_post: "Deleted post",
  delete_comment: "Deleted comment",
  resolve_report: "Resolved report",
  dismiss_report: "Dismissed report",
  auto_hide_post: "Auto-hidden post",
  auto_hide_comment: "Auto-hidden comment",
};

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [banTarget, setBanTarget] = useState<SafeUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importBundle, setImportBundle] = useState<any>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importMode, setImportMode] = useState<"preserve" | "remap">("preserve");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reports tab state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [actionDialog, setActionDialog] = useState<{ type: "resolve" | "dismiss"; ids: string[] } | null>(null);
  const [actionNote, setActionNote] = useState("");

  // Mod log
  const [modLogOffset, setModLogOffset] = useState(0);
  const MOD_LOG_LIMIT = 20;

  const { data: users = [], isLoading: usersLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.role === "admin",
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<SecurityLog[]>({
    queryKey: ["/api/admin/security-logs"],
    enabled: user?.role === "admin",
  });

  const reportsQuery = useQuery<EnrichedReport[]>({
    queryKey: ["/api/forum/reports", statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("targetType", typeFilter);
      const res = await apiRequest("GET", `/api/forum/reports?${params.toString()}`);
      return res.json();
    },
    enabled: user?.role === "admin",
  });
  const reports = reportsQuery.data ?? [];

  const modLogQuery = useQuery<ModLogEntry[]>({
    queryKey: ["/api/admin/mod-log", modLogOffset],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/mod-log?limit=${MOD_LOG_LIMIT}&offset=${modLogOffset}`);
      return res.json();
    },
    enabled: user?.role === "admin",
  });
  const modLog = modLogQuery.data ?? [];

  const resolveReportMutation = useMutation({
    mutationFn: async ({ ids, status, note }: { ids: string[]; status: string; note?: string }) => {
      if (ids.length === 1) {
        await apiRequest("PATCH", `/api/forum/admin/reports/${ids[0]}`, { status, note });
      } else {
        await apiRequest("POST", "/api/forum/admin/reports/bulk", { ids, action: status === "dismissed" ? "dismiss" : "resolve", note });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mod-log"] });
      toast({ title: "Reports updated" });
      setSelectedReports(new Set());
      setActionDialog(null);
      setActionNote("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update reports", description: err.message, variant: "destructive" });
    },
  });

  const hideContentMutation = useMutation({
    mutationFn: async ({ type, id, note }: { type: "posts" | "comments"; id: string; note?: string }) =>
      apiRequest("PATCH", `/api/forum/admin/${type}/${id}`, { hidden: true, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mod-log"] });
      toast({ title: "Content hidden" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to hide content", description: err.message, variant: "destructive" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => apiRequest("DELETE", `/api/forum/admin/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/forum/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mod-log"] });
      toast({ title: "Post deleted" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => apiRequest("DELETE", `/api/forum/admin/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mod-log"] });
      toast({ title: "Comment deleted" });
    },
  });

  const bulkHideMutation = useMutation({
    mutationFn: (reportIds: string[]) =>
      apiRequest("POST", "/api/forum/admin/bulk-hide", { reportIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mod-log"] });
      toast({ title: "Selected items hidden" });
      setSelectedReports(new Set());
    },
    onError: (err: Error) => {
      toast({ title: "Bulk hide failed", description: err.message, variant: "destructive" });
    },
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
  const pendingCount = reports.filter((r) => r.status === "pending").length;
  const selectedArr = Array.from(selectedReports);

  function toggleSelect(id: string) {
    setSelectedReports(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const pending = reports.filter(r => r.status === "pending").map(r => r.id);
    setSelectedReports(new Set(pending));
  }

  function clearSelection() {
    setSelectedReports(new Set());
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold dark:text-white">Security Admin</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold dark:text-white">{users.length}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldOff className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold dark:text-white">{bannedCount}</p>
                <p className="text-sm text-muted-foreground">Banned Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Flag className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold dark:text-white">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="logs">Security Logs</TabsTrigger>
          <TabsTrigger value="reports">
            Forum Reports
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="modlog">Mod Log</TabsTrigger>
          <TabsTrigger value="migration">Data Migration</TabsTrigger>
        </TabsList>

        {/* ── Users Tab ─────────────────────────────────────────────── */}
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
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate dark:text-white">
                            {u.displayName || u.email}
                          </p>
                          <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                            {u.role}
                          </Badge>
                          {u.isBanned && (
                            <Badge variant="destructive" className="text-xs">Banned</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                        {u.isBanned && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {u.banReason && <>Reason: {u.banReason}</>}
                            {u.bannedAt && <> · Banned {new Date(u.bannedAt).toLocaleDateString()}</>}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      {u.role !== "admin" && u.id !== user?.id && (
                        u.isBanned ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unbanMutation.mutate(u.id)}
                            disabled={unbanMutation.isPending}
                          >
                            <ShieldOff className="h-4 w-4 mr-1" />
                            Unban
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setBanTarget(u); setBanReason(""); }}
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            Ban
                          </Button>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No users found</p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Security Logs Tab ─────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4">
          {logsLoading ? (
            <p className="text-muted-foreground">Loading security logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No security events logged yet</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/50 text-sm"
                >
                  <Badge
                    variant={
                      log.eventType.includes("banned") || log.eventType.includes("failed")
                        ? "destructive"
                        : log.eventType.includes("success") || log.eventType.includes("unbanned")
                        ? "default"
                        : "secondary"
                    }
                    className="text-xs shrink-0 mt-0.5"
                  >
                    {log.eventType}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    {log.details && <p className="text-muted-foreground truncate">{log.details}</p>}
                    <p className="text-xs text-muted-foreground">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : "---"}
                      {log.ipAddress && ` · ${log.ipAddress}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Forum Reports Tab ─────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium dark:text-white">Status:</span>
            {["all", "pending", "resolved", "dismissed"].map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="h-7 text-xs capitalize"
                onClick={() => { setStatusFilter(s); setSelectedReports(new Set()); }}
              >
                {s}
              </Button>
            ))}
            <span className="text-sm font-medium dark:text-white ml-2">Type:</span>
            {[["all", "All"], ["post", "Posts"], ["comment", "Comments"]].map(([val, label]) => (
              <Button
                key={val}
                size="sm"
                variant={typeFilter === val ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => { setTypeFilter(val); setSelectedReports(new Set()); }}
              >
                {label}
              </Button>
            ))}
            {reports.some(r => r.status === "pending") && (
              <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={selectAll}>
                Select all pending
              </Button>
            )}
          </div>

          {/* Bulk action bar */}
          {selectedArr.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <span className="text-sm font-medium dark:text-blue-200">{selectedArr.length} selected</span>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActionDialog({ type: "dismiss", ids: selectedArr })}
              >
                Dismiss selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => bulkHideMutation.mutate(selectedArr)}
                disabled={bulkHideMutation.isPending}
              >
                {bulkHideMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3 mr-1" />}
                Hide all content
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          )}

          {reportsQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : reports.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No reports found.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className={`p-4 border rounded-lg transition-colors ${
                    selectedReports.has(report.id)
                      ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                      : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {report.status === "pending" && (
                      <Checkbox
                        checked={selectedReports.has(report.id)}
                        onCheckedChange={() => toggleSelect(report.id)}
                        className="mt-0.5 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Header row */}
                      <div className="flex items-center flex-wrap gap-2">
                        <Badge variant={report.status === "pending" ? "destructive" : report.status === "resolved" ? "default" : "secondary"}>
                          {report.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {report.postId ? "Post" : "Comment"}
                        </Badge>
                        {report.contentTitle && (
                          <span className="text-sm font-medium dark:text-white truncate max-w-xs">
                            "{report.contentTitle}"
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {report.createdAt ? new Date(report.createdAt).toLocaleString() : ""}
                        </span>
                      </div>

                      {/* Content preview */}
                      <div className="bg-muted/50 dark:bg-gray-800/60 rounded-md p-2.5 text-sm">
                        <p className="text-muted-foreground line-clamp-3">{report.contentBody}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Author: <span className="font-medium dark:text-gray-300">{report.contentAuthorName}</span>
                        </p>
                      </div>

                      {/* Report info */}
                      <div className="flex items-start gap-1 text-sm">
                        <Flag className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">
                          <span className="font-medium dark:text-gray-300">{report.reporterName}</span> reported:{" "}
                          <span className="italic">{report.reason}</span>
                        </span>
                      </div>

                      {report.note && (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                          <ClipboardList className="h-3 w-3 mt-0.5 shrink-0" />
                          Mod note: {report.note}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {report.status === "pending" && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                      {report.postId && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={hideContentMutation.isPending}
                            onClick={() => hideContentMutation.mutate({ type: "posts", id: report.postId! })}
                          >
                            <EyeOff className="h-3 w-3" /> Hide post
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={deletePostMutation.isPending}
                            onClick={() => {
                              if (confirm("Delete this post permanently?")) {
                                deletePostMutation.mutate(report.postId!);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" /> Delete post
                          </Button>
                        </>
                      )}
                      {report.commentId && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={hideContentMutation.isPending}
                            onClick={() => hideContentMutation.mutate({ type: "comments", id: report.commentId! })}
                          >
                            <EyeOff className="h-3 w-3" /> Hide comment
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={deleteCommentMutation.isPending}
                            onClick={() => {
                              if (confirm("Delete this comment permanently?")) {
                                deleteCommentMutation.mutate(report.commentId!);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" /> Delete comment
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setActionDialog({ type: "resolve", ids: [report.id] })}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setActionDialog({ type: "dismiss", ids: [report.id] })}
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Mod Log Tab ───────────────────────────────────────────── */}
        <TabsContent value="modlog" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold dark:text-white">Moderation Audit Log</h2>
            </div>
          </div>

          {modLogQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : modLog.length === 0 && modLogOffset === 0 ? (
            <p className="text-center text-muted-foreground py-8">No moderation actions recorded yet.</p>
          ) : (
            <>
              <div className="space-y-1">
                {modLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-2.5 px-3 rounded-md hover:bg-muted/40 text-sm border-b border-border/40 last:border-0"
                  >
                    <Badge
                      variant={
                        entry.action.includes("delete") ? "destructive" :
                        entry.action.includes("hide") ? "secondary" :
                        "default"
                      }
                      className="text-xs shrink-0 mt-0.5"
                    >
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground text-xs">
                        By <span className="font-medium dark:text-gray-300">{entry.moderatorName}</span>
                        {" · "}{entry.targetType}
                        {entry.targetSnippet && (
                          <span className="ml-1 italic text-muted-foreground">"{entry.targetSnippet.slice(0, 80)}{entry.targetSnippet.length > 80 ? "…" : ""}"</span>
                        )}
                      </p>
                      {entry.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">Note: {entry.note}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={modLogOffset === 0}
                  onClick={() => setModLogOffset(Math.max(0, modLogOffset - MOD_LOG_LIMIT))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={modLog.length < MOD_LOG_LIMIT}
                  onClick={() => setModLogOffset(modLogOffset + MOD_LOG_LIMIT)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Data Migration Tab ────────────────────────────────────── */}
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
                        onClick={() => {
                          if (confirm("This will import data into the database. Records with existing IDs will be skipped. Continue?")) {
                            importMutation.mutate({ bundle: importBundle, dryRun: false, mode: importMode });
                          }
                        }}
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

      {/* Ban dialog */}
      <Dialog open={!!banTarget} onOpenChange={(open) => !open && setBanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              Ban <strong>{banTarget?.displayName || banTarget?.email}</strong>? They will not be able to log in until unbanned.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason for ban (required)"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={banReason.trim().length < 3 || banMutation.isPending}
              onClick={() => banTarget && banMutation.mutate({ userId: banTarget.id, reason: banReason })}
            >
              Confirm Ban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve / Dismiss dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) { setActionDialog(null); setActionNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionDialog?.type} {actionDialog?.ids.length === 1 ? "Report" : `${actionDialog?.ids.length} Reports`}</DialogTitle>
            <DialogDescription>
              Optionally add an internal note explaining the decision.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Internal note (optional)"
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setActionNote(""); }}>Cancel</Button>
            <Button
              disabled={resolveReportMutation.isPending}
              onClick={() => {
                if (!actionDialog) return;
                resolveReportMutation.mutate({
                  ids: actionDialog.ids,
                  status: actionDialog.type === "resolve" ? "resolved" : "dismissed",
                  note: actionNote || undefined,
                });
              }}
            >
              {resolveReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
