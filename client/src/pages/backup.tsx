import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatabaseBackup, Download, ShieldCheck, ShieldAlert, Clock, RefreshCw, Loader2, CheckCircle2, Upload, AlertCircle } from "lucide-react";

const BACKUP_TS_KEY = "axtask_last_backup_ts";
const BACKUP_TESTED_KEY = "axtask_backup_restore_tested";

function formatTs(ts: number | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function timeSince(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function BackupPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const [lastBackupTs, setLastBackupTs] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(BACKUP_TS_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });

  const [restoreTested, setRestoreTested] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BACKUP_TESTED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [isExporting, setIsExporting] = useState(false);
  const [isManualBackup, setIsManualBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    inserted: Record<string, number>;
    skipped: Record<string, number>;
    errors: any[];
    warnings: any[];
  } | null>(null);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const saveTs = (ts: number) => {
    setLastBackupTs(ts);
    setRestoreTested(false);
    try {
      localStorage.setItem(BACKUP_TS_KEY, String(ts));
      localStorage.removeItem(BACKUP_TESTED_KEY);
    } catch {}
  };

  const markTested = () => {
    setRestoreTested(true);
    try {
      localStorage.setItem(BACKUP_TESTED_KEY, "true");
    } catch {}
  };

  const handleExportDB = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/account/export", { credentials: "include" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `axtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      saveTs(Date.now());
      toast({
        title: "Backup downloaded",
        description: "Your full account data has been exported as a .json file.",
      });
    } catch (error: any) {
      toast({
        title: "Backup failed",
        description: error.message || "Could not export account data.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleManualBackup = async () => {
    setIsManualBackup(true);
    try {
      const response = await fetch("/api/account/export", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `axtask-manual-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      saveTs(Date.now());
      toast({
        title: "Manual backup complete",
        description: "Backup saved. Keep this file somewhere safe.",
      });
    } catch (error: any) {
      toast({
        title: "Manual backup failed",
        description: error.message || "Could not create backup.",
        variant: "destructive",
      });
    } finally {
      setIsManualBackup(false);
    }
  };

  const handleMarkTested = () => {
    markTested();
    toast({
      title: "Marked as restore-tested",
      description: "Your backup has been confirmed as restorable.",
    });
  };

  const handleMarkUntested = () => {
    setRestoreTested(false);
    try {
      localStorage.removeItem(BACKUP_TESTED_KEY);
    } catch {}
    toast({ title: "Restore-tested status reset to Pending" });
  };

  const handleRestoreFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast({
        title: "Invalid file",
        description: "Please select a .json backup file exported from AxTask.",
        variant: "destructive",
      });
      if (restoreFileRef.current) restoreFileRef.current.value = "";
      return;
    }

    setIsRestoring(true);
    setRestoreResult(null);

    try {
      const text = await file.text();
      const bundle = JSON.parse(text);

      if (!bundle.metadata || !bundle.data) {
        throw new Error("This doesn't look like an AxTask backup file. It should have metadata and data sections.");
      }

      const dryRunResponse = await apiRequest("POST", "/api/account/import", { bundle, dryRun: true });
      const dryResult = await dryRunResponse.json();

      if (dryResult.errors && dryResult.errors.length > 0) {
        const errorMsgs = dryResult.errors.slice(0, 5).map((e: any) => `${e.table}: ${e.message}`).join("; ");
        throw new Error(`Validation issues: ${errorMsgs}`);
      }

      const response = await apiRequest("POST", "/api/account/import", { bundle, dryRun: false });
      const result = await response.json();

      setRestoreResult(result);

      if (!result.success || (result.errors && result.errors.length > 0)) {
        const errorCount = result.errors?.length || 0;
        toast({
          title: "Restore had issues",
          description: `Import completed with ${errorCount} error(s). Some data may not have been restored.`,
          variant: "destructive",
        });
      } else {
        const totalInserted = Object.values(result.inserted as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/badges"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/my-rewards"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/rewards"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/classification-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gamification/cleanup-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/patterns/insights"] });
        queryClient.invalidateQueries({ queryKey: ["/api/import-history"] });

        markTested();
        if (!lastBackupTs) {
          const now = Date.now();
          setLastBackupTs(now);
          try {
            localStorage.setItem(BACKUP_TS_KEY, String(now));
          } catch {}
        }

        toast({
          title: "Backup restored successfully",
          description: `${totalInserted} records imported. Restore Tested badge marked as Confirmed.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Restore failed",
        description: error.message || "Could not restore from backup file.",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
      if (restoreFileRef.current) restoreFileRef.current.value = "";
    }
  };

  const backupStatus = !lastBackupTs ? "Never backed up" : restoreTested ? "Confirmed" : "Pending verification";
  const statusColor = !lastBackupTs
    ? "text-red-600 dark:text-red-400"
    : restoreTested
    ? "text-green-600 dark:text-green-400"
    : "text-yellow-600 dark:text-yellow-400";

  const totalRestored = restoreResult?.success
    ? Object.values(restoreResult.inserted as Record<string, number>).reduce((a: number, b: number) => a + b, 0)
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Backup Center</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Keep your data safe — export, restore, and verify backups of your AxTask account
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Backup</span>
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatTs(lastBackupTs)}</div>
            {lastBackupTs && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{timeSince(lastBackupTs)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              {restoreTested ? (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Backup Status</span>
            </div>
            <div className={`text-sm font-medium ${statusColor}`}>{backupStatus}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className={`h-4 w-4 ${restoreTested ? "text-green-500" : "text-gray-400"}`} />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Restore Tested</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={restoreTested ? "default" : "secondary"}>
                {restoreTested ? "Confirmed" : "Pending"}
              </Badge>
              {restoreTested ? (
                <button
                  onClick={handleMarkUntested}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
                  style={{ cursor: "pointer" }}
                >
                  Reset
                </button>
              ) : lastBackupTs ? (
                <button
                  onClick={handleMarkTested}
                  className="text-xs text-blue-500 hover:text-blue-600 underline"
                  style={{ cursor: "pointer" }}
                >
                  Mark as tested
                </button>
              ) : (
                <span className="text-xs text-gray-400 italic">Create a backup first</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-2 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <DatabaseBackup className="mr-2 h-5 w-5 text-blue-600" />
              Export Full Backup
            </CardTitle>
            <CardDescription>
              Download a complete .json backup of your tasks, AxCoins, badges, and all account data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <strong>{tasks.length}</strong> tasks will be included in the backup.
            </div>
            <Button
              onClick={handleExportDB}
              disabled={isExporting}
              className="w-full"
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isExporting ? "Exporting..." : "Export DB Backup"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <RefreshCw className="mr-2 h-5 w-5 text-gray-500" />
              Manual Backup
            </CardTitle>
            <CardDescription>
              Trigger an on-demand backup now. Use this to create a checkpoint before major changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Backup includes all your data — same as Export DB but labeled as a manual snapshot.
            </div>
            <Button
              onClick={handleManualBackup}
              disabled={isManualBackup}
              variant="outline"
              className="w-full"
            >
              {isManualBackup ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {isManualBackup ? "Creating backup..." : "Manual Backup Now"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle className="flex items-center text-base">
            <Upload className="mr-2 h-5 w-5 text-green-600" />
            Restore from Backup
          </CardTitle>
          <CardDescription>
            Upload a previously exported .json backup file to restore your account data. A validation check runs first to catch any issues before importing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            After a successful restore, the <strong>Restore Tested</strong> badge will automatically be marked as Confirmed.
          </div>

          <div className="space-y-2">
            <Label htmlFor="restore-file" className="text-sm font-medium">
              Select backup file (.json)
            </Label>
            <Input
              id="restore-file"
              ref={restoreFileRef}
              type="file"
              accept=".json"
              onChange={handleRestoreFileChange}
              disabled={isRestoring}
              className="cursor-pointer file:cursor-pointer file:mr-2 file:text-sm file:font-medium"
            />
          </div>

          {isRestoring && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating and restoring backup...
            </div>
          )}

          {restoreResult && (
            <div className={`rounded-lg border p-3 space-y-1 ${
              restoreResult.success && restoreResult.errors?.length === 0
                ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
            }`}>
              <div className="flex items-center gap-2">
                {restoreResult.success && restoreResult.errors?.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                )}
                <span className={`text-sm font-medium ${
                  restoreResult.success && restoreResult.errors?.length === 0
                    ? "text-green-800 dark:text-green-200"
                    : "text-red-800 dark:text-red-200"
                }`}>
                  {restoreResult.success && restoreResult.errors?.length === 0
                    ? `Restore complete — ${totalRestored} records imported`
                    : `Restore completed with ${restoreResult.errors?.length || 0} error(s)`}
                </span>
              </div>
              {Object.entries(restoreResult.inserted || {}).filter(([, v]) => (v as number) > 0).map(([table, count]) => (
                <div key={table} className="text-xs text-gray-600 dark:text-gray-400 pl-6">
                  {table}: {count as number} record{(count as number) !== 1 ? "s" : ""} restored
                </div>
              ))}
              {restoreResult.warnings?.length > 0 && (
                <div className="text-xs text-yellow-700 dark:text-yellow-300 pl-6">
                  {restoreResult.warnings.length} warning(s) — some records may have been skipped
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!lastBackupTs && (
        <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200">No backup on record</div>
            <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-0.5">
              You haven't created a backup yet. Export your data now to avoid losing it.
            </div>
          </div>
        </div>
      )}

      {lastBackupTs && !restoreTested && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-blue-800 dark:text-blue-200">Restore not yet verified</div>
            <div className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
              To confirm your backup is valid, use the <strong>Restore from Backup</strong> section above. A successful restore will automatically mark it as tested.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
