import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Task, type ImportHistory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { tasksToCSV, parseTasksFromCSV, downloadCSV, parseExcelSheetInfo } from "@/lib/csv-utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Upload, Download, FileText, AlertCircle, AlertTriangle, CheckCircle2, Loader2, History, ShieldAlert, SkipForward, DatabaseBackup, PackageOpen, Shield, Trash2, Lock, Unlock, QrCode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SheetInfo {
  sheetName: string;
  tasks: any[];
  rowCount: number;
  selected: boolean;
}

interface ImportResult {
  imported: number;
  forceImported: number;
  skippedCompleted: number;
  skippedDuplicate: number;
  failed: number;
  total: number;
  fileWarning: string | null;
}

export default function ImportExport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [forceImport, setForceImport] = useState(false);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [isExportingAccount, setIsExportingAccount] = useState(false);
  const [isImportingAccount, setIsImportingAccount] = useState(false);
  const [accountImportResult, setAccountImportResult] = useState<{
    success: boolean;
    inserted: Record<string, number>;
    skipped: Record<string, number>;
    errors: any[];
    warnings: any[];
  } | null>(null);
  const accountFileRef = useRef<HTMLInputElement>(null);

  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [isMfaSetupLoading, setIsMfaSetupLoading] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [clearAllMfaCode, setClearAllMfaCode] = useState("");
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: importHistoryData = [] } = useQuery<ImportHistory[]>({
    queryKey: ["/api/import-history"],
  });

  const { data: mfaStatus, refetch: refetchMfa } = useQuery<{ mfaEnabled: boolean }>({
    queryKey: ["/api/mfa/status"],
  });

  const handleExport = () => {
    if (tasks.length === 0) {
      toast({
        title: "No tasks to export",
        description: "Create some tasks first before exporting.",
        variant: "destructive",
      });
      return;
    }

    try {
      const csvContent = tasksToCSV(tasks);
      const filename = `tasks-export-${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csvContent, filename);
      toast({
        title: "Export successful",
        description: `Downloaded ${tasks.length} tasks to ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export tasks. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isCSV = file.name.endsWith('.csv');
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isJSON = file.name.endsWith('.json');

    if (!isCSV && !isExcel && !isJSON) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV, Excel, or JSON file.",
        variant: "destructive",
      });
      return;
    }

    if (isJSON) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (parsed.metadata && parsed.data) {
          setIsImportingAccount(true);
          setAccountImportResult(null);
          try {
            const dryRunResponse = await apiRequest("POST", "/api/account/import", { bundle: parsed, dryRun: true });
            const dryResult = await dryRunResponse.json();

            if (dryResult.errors && dryResult.errors.length > 0) {
              const errorMsgs = dryResult.errors.slice(0, 5).map((e: any) => `${e.table}: ${e.message}`).join("; ");
              throw new Error(`Validation issues: ${errorMsgs}`);
            }

            const response = await apiRequest("POST", "/api/account/import", { bundle: parsed, dryRun: false });
            const result = await response.json();
            setAccountImportResult(result);

            if (!result.success || (result.errors && result.errors.length > 0)) {
              toast({
                title: "Account restore had issues",
                description: `Import completed with ${result.errors?.length || 0} error(s).`,
                variant: "destructive",
              });
            } else {
              const totalInserted = Object.values(result.inserted as Record<string, number>).reduce((a, b) => a + b, 0);
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
              toast({
                title: "Backup restored successfully",
                description: `${totalInserted} records imported from JSON backup file.`,
              });
            }
          } catch (err: any) {
            toast({
              title: "Backup restore failed",
              description: err.message || "Could not restore from backup file.",
              variant: "destructive",
            });
          } finally {
            setIsImportingAccount(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }
          return;
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          const taskArray = parsed.map((item: any) => ({
            date: item.date || new Date().toISOString().split('T')[0],
            activity: item.activity || item.title || item.name || '',
            notes: item.notes || item.description || '',
            status: item.status || 'pending',
            urgency: typeof item.urgency === 'number' ? item.urgency : undefined,
            impact: typeof item.impact === 'number' ? item.impact : undefined,
            effort: typeof item.effort === 'number' ? item.effort : undefined,
            prerequisites: item.prerequisites || '',
          })).filter((t: any) => t.activity && t.activity.trim());

          if (taskArray.length > 0) {
            setFileName(file.name);
            setFileContent(text);
            setSheets([{ sheetName: file.name, tasks: taskArray, rowCount: taskArray.length, selected: true }]);
            toast({
              title: "JSON file analyzed",
              description: `Found ${taskArray.length} tasks in JSON array.`,
            });
          } else {
            toast({
              title: "No valid tasks found",
              description: "The JSON array doesn't contain any valid task objects.",
              variant: "destructive",
            });
          }
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        toast({
          title: "Unrecognized JSON format",
          description: "Expected either an AxTask backup bundle or an array of task objects.",
          variant: "destructive",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      } catch (err: any) {
        if (err.message?.includes("JSON")) {
          toast({
            title: "Invalid JSON file",
            description: "The file could not be parsed as valid JSON.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Failed to process JSON file",
            description: err.message || "An error occurred while processing the file.",
            variant: "destructive",
          });
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setIsParsing(true);
    setImportResult(null);
    setSheets([]);
    setFileName(file.name);

    try {
      const rawContent = await file.text();
      setFileContent(rawContent);

      if (isExcel) {
        const sheetResults = await parseExcelSheetInfo(file);
        const sheetInfos: SheetInfo[] = sheetResults.map(s => ({
          ...s,
          selected: true,
        }));
        setSheets(sheetInfos);

        const totalTasks = sheetInfos.reduce((sum, s) => sum + s.rowCount, 0);
        toast({
          title: "File analyzed",
          description: `Found ${totalTasks} tasks across ${sheetInfos.length} sheets. Select which sheets to import.`,
        });
      } else {
        const parsed = parseTasksFromCSV(rawContent);
        if (parsed.length > 0) {
          setSheets([{ sheetName: file.name, tasks: parsed, rowCount: parsed.length, selected: true }]);
        } else {
          toast({
            title: "No tasks found",
            description: "The file doesn't contain any valid task data.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Parse error:", error);
      toast({
        title: "Failed to read file",
        description: "Please check the file format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const toggleSheet = (index: number) => {
    setSheets(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const handleImport = async () => {
    const selectedSheets = sheets.filter(s => s.selected);
    if (selectedSheets.length === 0) {
      toast({ title: "No sheets selected", variant: "destructive" });
      return;
    }

    const allTasks = selectedSheets.flatMap(s => s.tasks);
    if (allTasks.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportMessage(`Importing ${allTasks.length} tasks...`);
    setImportResult(null);

    try {
      const CHUNK_SIZE = 500;
      let totalImported = 0;
      let totalForceImported = 0;
      let totalSkippedCompleted = 0;
      let totalSkippedDuplicate = 0;
      let totalFailed = 0;
      let lastFileWarning: string | null = null;
      let retriesUsed = 0;

      const totalChunks = Math.ceil(allTasks.length / CHUNK_SIZE);

      for (let i = 0; i < allTasks.length; i += CHUNK_SIZE) {
        const chunk = allTasks.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

        setImportMessage(`Sending batch ${chunkNum} of ${totalChunks} (${chunk.length} tasks)...`);

        let attempt = 0;
        let result: any = null;
        while (attempt < 3) {
          try {
            const response = await apiRequest("POST", "/api/tasks/import", {
              tasks: chunk,
              forceImport,
              fileName,
              skipHistory: true,
            });
            result = await response.json();
            break;
          } catch (err: any) {
            attempt++;
            retriesUsed++;
            if (attempt >= 3) {
              throw new Error(`Batch ${chunkNum} failed after 3 attempts: ${err?.message || "Unknown error"}`);
            }
            setImportMessage(`Batch ${chunkNum} failed (attempt ${attempt}/3), retrying...`);
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }

        totalImported += result.imported || 0;
        totalForceImported += result.forceImported || 0;
        totalSkippedCompleted += result.skippedCompleted || 0;
        totalSkippedDuplicate += result.skippedDuplicate || 0;
        totalFailed += result.failed || 0;
        if (result.fileWarning) lastFileWarning = result.fileWarning;

        const progress = Math.round(((i + chunk.length) / allTasks.length) * 100);
        setImportProgress(progress);
      }

      if (fileContent && fileName) {
        await apiRequest("POST", "/api/tasks/import", {
          tasks: [],
          forceImport,
          fileName,
          fileContent: fileContent.length > 5_000_000 ? fileContent.slice(0, 5_000_000) : fileContent,
          summaryTotals: {
            total: allTasks.length,
            imported: totalImported,
            skippedCompleted: totalSkippedCompleted,
            skippedDuplicate: totalSkippedDuplicate,
            forceImported: totalForceImported,
          },
        }).catch(() => {});
      }

      const res: ImportResult = {
        imported: totalImported,
        forceImported: totalForceImported,
        skippedCompleted: totalSkippedCompleted,
        skippedDuplicate: totalSkippedDuplicate,
        failed: totalFailed,
        total: allTasks.length,
        fileWarning: lastFileWarning,
      };
      setImportResult(res);
      setImportMessage(`Done! ${totalImported} new tasks imported.`);

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/import-history"] });

      const skipped = totalSkippedCompleted + totalSkippedDuplicate;
      toast({
        title: "Import complete",
        description: `${totalImported} imported${skipped > 0 ? `, ${skipped} duplicates skipped` : ''}${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`,
      });
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "An error occurred during import.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const totalSelected = sheets.filter(s => s.selected).reduce((sum, s) => sum + s.rowCount, 0);

  const csvTemplate = `Date,Activity,Notes,Urgency,Impact,Effort,Prerequisites,Status
2025-07-30,"Deploy new version","@urgent deployment needed",4,5,3,"Testing completed",pending
2025-07-30,"Team meeting","Weekly standup #meeting",,,,,"pending"
2025-07-29,"Fix bug in authentication","Error in login flow #blocker",5,4,2,"Bug report received",in-progress`;

  const handleDownloadTemplate = () => {
    downloadCSV(csvTemplate, "task-import-template.csv");
    toast({
      title: "Template downloaded",
      description: "Use this template to format your task data for import.",
    });
  };

  const handleMfaSetup = async () => {
    setIsMfaSetupLoading(true);
    try {
      const response = await apiRequest("POST", "/api/mfa/setup", {});
      const data = await response.json();
      setMfaSetupData({ secret: data.secret, qrCode: data.qrCode });
      setMfaCode("");
    } catch (error: any) {
      toast({
        title: "MFA setup failed",
        description: error.message || "Could not initiate MFA setup.",
        variant: "destructive",
      });
    } finally {
      setIsMfaSetupLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaCode.trim()) return;
    try {
      const response = await apiRequest("POST", "/api/mfa/verify", { code: mfaCode.trim() });
      const data = await response.json();
      if (data.success) {
        toast({ title: "MFA enabled", description: "Two-factor authentication is now active on your account." });
        setMfaSetupData(null);
        setMfaCode("");
        refetchMfa();
      }
    } catch (error: any) {
      const msg = error?.message || "Invalid code";
      toast({ title: "Verification failed", description: msg, variant: "destructive" });
    }
  };

  const handleMfaDisable = async () => {
    if (!mfaDisableCode.trim()) return;
    setIsDisablingMfa(true);
    try {
      const response = await apiRequest("POST", "/api/mfa/disable", { code: mfaDisableCode.trim() });
      const data = await response.json();
      if (data.success) {
        toast({ title: "MFA disabled", description: "Two-factor authentication has been removed from your account." });
        setMfaDisableCode("");
        refetchMfa();
      }
    } catch (error: any) {
      toast({ title: "Failed to disable MFA", description: error?.message || "Invalid code", variant: "destructive" });
    } finally {
      setIsDisablingMfa(false);
    }
  };

  const handleClearAllTasks = async () => {
    if (!clearAllMfaCode.trim()) return;
    setIsClearingAll(true);
    try {
      const response = await apiRequest("POST", "/api/tasks/clear-all", { mfaCode: clearAllMfaCode.trim() });
      const data = await response.json();
      if (data.success) {
        toast({ title: "All tasks cleared", description: `${data.deletedCount} tasks have been permanently deleted.` });
        setShowClearAllDialog(false);
        setClearAllMfaCode("");
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
      }
    } catch (error: any) {
      toast({ title: "Failed to clear tasks", description: error?.message || "Action denied", variant: "destructive" });
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleAccountExport = async () => {
    setIsExportingAccount(true);
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
      a.download = `my-axtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Account backup downloaded",
        description: "Your full account data has been exported including tasks, coins, badges, and patterns.",
      });
    } catch (error: any) {
      toast({
        title: "Account export failed",
        description: error.message || "Could not export account data.",
        variant: "destructive",
      });
    } finally {
      setIsExportingAccount(false);
    }
  };

  const handleAccountImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast({
        title: "Invalid file",
        description: "Please select a .json backup file exported from AxTask.",
        variant: "destructive",
      });
      return;
    }

    setIsImportingAccount(true);
    setAccountImportResult(null);

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

      setAccountImportResult(result);

      if (!result.success || (result.errors && result.errors.length > 0)) {
        const errorCount = result.errors?.length || 0;
        toast({
          title: "Account restore had issues",
          description: `Import completed with ${errorCount} error(s). Some data may not have been restored.`,
          variant: "destructive",
        });
      } else {
        const totalInserted = Object.values(result.inserted as Record<string, number>).reduce((a, b) => a + b, 0);
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

        toast({
          title: "Account restore complete",
          description: `${totalInserted} records imported across all tables.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Account import failed",
        description: error.message || "Could not import account data.",
        variant: "destructive",
      });
    } finally {
      setIsImportingAccount(false);
      if (accountFileRef.current) accountFileRef.current.value = "";
    }
  };

  const ACCOUNT_TABLE_LABELS: Record<string, string> = {
    tasks: "Tasks",
    wallets: "Wallet",
    coinTransactions: "Coin Transactions",
    userBadges: "Badges",
    userRewards: "Rewards",
    taskPatterns: "Learned Patterns",
    taskCollaborators: "Collaborators",
    classificationContributions: "Classifications",
    classificationConfirmations: "Confirmations",
    users: "User Profile",
    rewardsCatalog: "Reward Catalog",
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Import/Export</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Sync your tasks with Google Sheets or other tools</p>
      </div>

      <Card className="border-2 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="flex items-center">
            <DatabaseBackup className="mr-2 h-5 w-5 text-blue-600" />
            Full Account Backup & Restore
          </CardTitle>
          <CardDescription>
            Export or restore your complete account — tasks, AxCoins, wallet, badges, patterns, and all associated data. Use this to migrate between environments or create a full backup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">Export Everything</div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Downloads a single .json file containing all your tasks, coin balance, transaction history, badges, learned patterns, and collaborator data.
              </p>
              <Button
                onClick={handleAccountExport}
                disabled={isExportingAccount}
                className="w-full"
                variant="default"
              >
                {isExportingAccount ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExportingAccount ? "Exporting..." : "Download Full Backup"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Restore from Backup</div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Upload a previously exported .json backup to restore your data. A validation check runs first to catch any issues before importing.
              </p>
              <div className="space-y-2">
                <Input
                  ref={accountFileRef}
                  type="file"
                  accept=".json"
                  onChange={handleAccountImport}
                  disabled={isImportingAccount}
                />
              </div>
              {isImportingAccount && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-900 dark:text-blue-100">Validating and importing...</span>
                </div>
              )}
            </div>
          </div>

          {accountImportResult && (
            <div className={`mt-4 p-4 rounded-lg space-y-3 ${
              accountImportResult.success
                ? "bg-green-50 dark:bg-green-900/30"
                : "bg-red-50 dark:bg-red-900/30"
            }`}>
              <div className="flex items-center gap-2">
                {accountImportResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                <span className={`text-sm font-medium ${
                  accountImportResult.success
                    ? "text-green-900 dark:text-green-100"
                    : "text-red-900 dark:text-red-100"
                }`}>
                  {accountImportResult.success ? "Account Restore Complete" : "Account Restore Had Issues"}
                </span>
              </div>
              {accountImportResult.errors && accountImportResult.errors.length > 0 && (
                <div className="text-xs text-red-700 dark:text-red-300 space-y-1">
                  {accountImportResult.errors.slice(0, 5).map((err: any, i: number) => (
                    <div key={i} className="flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{err.table}: {err.message}</span>
                    </div>
                  ))}
                  {accountImportResult.errors.length > 5 && (
                    <div className="text-red-600">...and {accountImportResult.errors.length - 5} more errors</div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-center text-xs">
                {Object.entries(accountImportResult.inserted)
                  .filter(([, count]) => (count as number) > 0)
                  .map(([table, count]) => (
                    <div key={table} className="p-2 bg-white dark:bg-gray-800 rounded">
                      <div className="font-bold text-lg text-green-700 dark:text-green-300">
                        {(count as number).toLocaleString()}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        {ACCOUNT_TABLE_LABELS[table] || table}
                      </div>
                    </div>
                  ))}
              </div>
              {accountImportResult.skipped && Object.values(accountImportResult.skipped).some(v => (v as number) > 0) && (
                <div className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                  <SkipForward className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    {Object.values(accountImportResult.skipped).reduce((a, b) => (a as number) + (b as number), 0) as number} duplicate records were automatically skipped.
                  </span>
                </div>
              )}
              {accountImportResult.warnings && accountImportResult.warnings.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {accountImportResult.warnings.length} warning(s) during import.
                </div>
              )}
            </div>
          )}

          <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <PackageOpen className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-1">What's included in a full backup:</p>
                <span className="text-blue-700 dark:text-blue-300">
                  Tasks, AxCoin wallet & balance, transaction history, earned badges, purchased rewards, learned patterns, collaborator links, and classification data.
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="mr-2 h-5 w-5" />
              Export Tasks (CSV)
            </CardTitle>
            <CardDescription>
              Download your tasks as a CSV file for use in Google Sheets or other applications. For a full backup including coins and badges, use the backup tool above.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
              <div className="flex items-center">
                <FileText className="mr-2 h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {tasks.length} tasks ready for export
                </span>
              </div>
            </div>
            <Button onClick={handleExport} className="w-full" disabled={tasks.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export to CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Upload className="mr-2 h-5 w-5" />
              Import Tasks
            </CardTitle>
            <CardDescription>
              Upload a CSV, Excel, or JSON file to import tasks. Duplicates are automatically detected and skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Choose File</Label>
              <Input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileSelect}
                disabled={isImporting || isParsing}
              />
            </div>

            {isParsing && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-900 dark:text-blue-100">Analyzing file...</span>
              </div>
            )}

            {sheets.length > 0 && !isImporting && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Sheets found:</div>
                {sheets.map((sheet, idx) => (
                  <div
                    key={sheet.sheetName}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => toggleSheet(idx)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={sheet.selected}
                        onCheckedChange={() => toggleSheet(idx)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <div className="text-sm font-medium">{sheet.sheetName}</div>
                        <div className="text-xs text-gray-500">{sheet.rowCount.toLocaleString()} tasks</div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <div>
                      <div className="text-sm font-medium text-amber-900 dark:text-amber-100">Force import duplicates</div>
                      <div className="text-xs text-amber-700 dark:text-amber-300">Import even if tasks already exist. Forced duplicates earn no rewards.</div>
                    </div>
                  </div>
                  <Switch checked={forceImport} onCheckedChange={setForceImport} />
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Total selected: {totalSelected.toLocaleString()} tasks
                  </span>
                  <Button
                    onClick={handleImport}
                    disabled={totalSelected === 0}
                    size="sm"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import Selected
                  </Button>
                </div>
              </div>
            )}

            {isImporting && (
              <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {importMessage}
                  </span>
                </div>
                <Progress value={importProgress} className="h-2" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  {importProgress}% complete
                </div>
              </div>
            )}

            {importResult && !isImporting && (
              <div className="space-y-3">
                {importResult.fileWarning && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-amber-900 dark:text-amber-100">{importResult.fileWarning}</span>
                  </div>
                )}

                <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900 dark:text-green-100">
                      Import Complete
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-white dark:bg-gray-800 rounded">
                      <div className="font-bold text-lg text-green-700 dark:text-green-300">
                        {importResult.imported.toLocaleString()}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">New Imported</div>
                    </div>
                    {importResult.skippedCompleted > 0 && (
                      <div className="p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="font-bold text-lg text-orange-600">
                          {importResult.skippedCompleted.toLocaleString()}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">Already Done</div>
                      </div>
                    )}
                    {importResult.skippedDuplicate > 0 && (
                      <div className="p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="font-bold text-lg text-yellow-600">
                          {importResult.skippedDuplicate.toLocaleString()}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">Existing Duplicates</div>
                      </div>
                    )}
                    {importResult.forceImported > 0 && (
                      <div className="p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="font-bold text-lg text-amber-600">
                          {importResult.forceImported.toLocaleString()}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">Force Imported</div>
                      </div>
                    )}
                    {importResult.failed > 0 && (
                      <div className="p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="font-bold text-lg text-red-600">
                          {importResult.failed.toLocaleString()}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">Failed</div>
                      </div>
                    )}
                  </div>
                  {(importResult.skippedCompleted > 0 || importResult.skippedDuplicate > 0) && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <SkipForward className="h-3 w-3" />
                      {importResult.skippedCompleted + importResult.skippedDuplicate} duplicate tasks were skipped to prevent reward inflation.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="mr-2 h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-900 dark:text-yellow-100">
                  <p className="font-medium mb-1">Supported formats:</p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    <li>Excel (.xlsx) with sheets: Daily Planner 2026, Archives, Vault</li>
                    <li>CSV with columns: Date, Activity, Notes, Urgency, Impact, Effort</li>
                    <li>JSON — AxTask backup bundles or plain task arrays</li>
                    <li>Priority and classification are auto-calculated after import</li>
                    <li>Duplicate tasks are automatically detected and skipped</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleDownloadTemplate}
              className="w-full"
            >
              <FileText className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </CardContent>
        </Card>
      </div>

      {importHistoryData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <History className="mr-2 h-5 w-5" />
              Import History
            </CardTitle>
            <CardDescription>Previous file imports and their results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {importHistoryData.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                  <div>
                    <div className="font-medium">{h.fileName}</div>
                    <div className="text-xs text-gray-500">
                      {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : "Unknown date"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{h.imported} imported</Badge>
                    {(h.skippedCompleted + h.skippedDuplicate) > 0 && (
                      <Badge variant="outline">{h.skippedCompleted + h.skippedDuplicate} skipped</Badge>
                    )}
                    {h.forceImported > 0 && (
                      <Badge variant="outline" className="text-amber-600">{h.forceImported} forced</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google Sheets Integration</CardTitle>
          <CardDescription>
            How to sync your tasks with Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm mb-2">To export to Google Sheets:</h4>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                <li>Click "Export to CSV" above to download your tasks</li>
                <li>Open Google Sheets and create a new spreadsheet</li>
                <li>Go to File, Import, Upload and select your CSV file</li>
                <li>Choose "Replace spreadsheet" and click "Import data"</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-2">To import from Google Sheets:</h4>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                <li>Download your Google Sheet as .xlsx (File, Download, Excel)</li>
                <li>Use the file picker above to upload it</li>
                <li>Select which sheets to import and click Import</li>
                <li>Priority scores will be auto-calculated</li>
              </ol>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Tip:</strong> The priority scoring engine from your Google Apps Script
                is built into AxTask, so your tasks will have consistent priority scoring.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="mr-2 h-5 w-5 text-indigo-600" />
            Two-Factor Authentication (MFA)
          </CardTitle>
          <CardDescription>
            Secure your account with TOTP-based two-factor authentication using an authenticator app like Google Authenticator, Authy, or 1Password. MFA is required for destructive actions like clearing all tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mfaStatus?.mfaEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                <Lock className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-900 dark:text-green-100">
                  MFA is enabled on your account
                </span>
              </div>
              <div className="space-y-2">
                <Label>To disable MFA, enter your current authenticator code:</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaDisableCode}
                    onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-32 text-center font-mono text-lg tracking-widest"
                  />
                  <Button
                    variant="destructive"
                    onClick={handleMfaDisable}
                    disabled={mfaDisableCode.length !== 6 || isDisablingMfa}
                  >
                    {isDisablingMfa ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
                    Disable MFA
                  </Button>
                </div>
              </div>
            </div>
          ) : mfaSetupData ? (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg space-y-3">
                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                  Scan this QR code with your authenticator app:
                </p>
                <div className="flex justify-center">
                  <img src={mfaSetupData.qrCode} alt="MFA QR Code" className="w-48 h-48 rounded-lg border" />
                </div>
                <div className="text-xs text-center text-gray-500 dark:text-gray-400 space-y-1">
                  <p>Or enter this secret manually:</p>
                  <code className="block bg-white dark:bg-gray-800 px-3 py-1.5 rounded text-sm font-mono select-all break-all">
                    {mfaSetupData.secret}
                  </code>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Enter the 6-digit code from your authenticator app to confirm:</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-32 text-center font-mono text-lg tracking-widest"
                  />
                  <Button onClick={handleMfaVerify} disabled={mfaCode.length !== 6}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Verify & Enable
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setMfaSetupData(null); setMfaCode(""); }}>
                Cancel Setup
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-900 dark:text-yellow-100">
                  MFA is not enabled. Enable it to unlock Danger Zone actions and add an extra layer of security.
                </span>
              </div>
              <Button onClick={handleMfaSetup} disabled={isMfaSetupLoading}>
                {isMfaSetupLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="mr-2 h-4 w-4" />
                )}
                Set Up MFA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-2 border-red-300 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center text-red-700 dark:text-red-400">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Destructive actions that cannot be undone. These require MFA verification for security.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border-2 border-red-200 dark:border-red-800 rounded-lg space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-900 dark:text-red-100">Clear All Tasks</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Permanently delete all {tasks.length.toLocaleString()} tasks from your account. This action cannot be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (!mfaStatus?.mfaEnabled) {
                    toast({
                      title: "MFA required",
                      description: "You must enable two-factor authentication before performing destructive actions.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowClearAllDialog(true);
                  setClearAllMfaCode("");
                }}
                disabled={tasks.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All Tasks
              </Button>
            </div>
          </div>
          {!mfaStatus?.mfaEnabled && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-xs text-amber-900 dark:text-amber-100">
                Danger zone actions are locked. Enable MFA (above) to unlock them.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Confirm: Clear All Tasks
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all {tasks.length.toLocaleString()} tasks from your account. This action cannot be undone. Enter your MFA code to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <p className="text-sm text-red-900 dark:text-red-100 font-medium">
                You are about to delete {tasks.length.toLocaleString()} tasks permanently.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Enter your 6-digit authenticator code:</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={clearAllMfaCode}
                onChange={(e) => setClearAllMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-32 text-center font-mono text-lg tracking-widest"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAllDialog(false)} disabled={isClearingAll}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAllTasks}
              disabled={clearAllMfaCode.length !== 6 || isClearingAll}
            >
              {isClearingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {isClearingAll ? "Clearing..." : "Delete All Tasks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
