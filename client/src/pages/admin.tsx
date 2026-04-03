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
