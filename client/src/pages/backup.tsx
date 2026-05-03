import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatabaseBackup, Download, ShieldCheck, ShieldAlert, Clock, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";

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
    setRestoreTested(true);
    try {
      localStorage.setItem(BACKUP_TESTED_KEY, "true");
    } catch {}
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

  const backupStatus = !lastBackupTs ? "Never backed up" : restoreTested ? "Confirmed" : "Pending verification";
  const statusColor = !lastBackupTs
    ? "text-red-600 dark:text-red-400"
    : restoreTested
    ? "text-green-600 dark:text-green-400"
    : "text-yellow-600 dark:text-yellow-400";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Backup Center</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Keep your data safe — export and verify backups of your AxTask account
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
              To confirm your backup is valid, try restoring it on the{" "}
              <a href="/import-export" className="underline font-medium">Import/Export</a> page, then come back and mark it as restore-tested.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
