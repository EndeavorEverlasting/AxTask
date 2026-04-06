/**
 * Import/Export UI: **spreadsheet (CSV/Excel) and JSON backup are both required product surfaces.**
 * Server-side dedupe and anti–double-task rules live in `server/import-task-dedupe.ts` (see `.cursor/rules/axtask-import-dedupe.mdc`).
 */
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { apiRequest } from "@/lib/queryClient";
import { useMfaChallenge } from "@/hooks/use-mfa-challenge";
import { MfaVerificationPanel } from "@/components/mfa/mfa-verification-panel";
import { formatAxTaskCsvAttribution } from "@shared/attribution";
import { tasksToCSV, parseTasksFromCSV, downloadCSV, parseExcelSheetInfo } from "@/lib/csv-utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2, FileCode } from "lucide-react";

interface SheetInfo {
  sheetName: string;
  tasks: any[];
  rowCount: number;
  selected: boolean;
}

type UserExportBundle = {
  metadata: { exportMode?: string; exportedAt?: string; tableCounts?: Record<string, number> };
  data: Record<string, unknown[]>;
};

function isUserExportBundle(parsed: unknown): parsed is UserExportBundle {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  const m = p.metadata;
  const d = p.data;
  if (!m || typeof m !== "object") return false;
  if (!d || typeof d !== "object") return false;
  return (m as Record<string, unknown>).exportMode === "user";
}

interface AccountImportApiResult {
  success: boolean;
  dryRun: boolean;
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: Record<string, number>;
  errors?: { table: string; field: string; message: string }[];
  warnings?: { table: string; field: string; message: string }[];
}

export default function ImportExport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { requestChallenge: requestDataExportChallenge, isRequesting: dataExportCodeSending } = useMfaChallenge();
  const [dataExportMfaOpen, setDataExportMfaOpen] = useState(false);
  const [dataExportChallenge, setDataExportChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    maskedDestination?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: number;
    skippedAsDuplicate?: number;
    total: number;
  } | null>(null);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [jsonBundle, setJsonBundle] = useState<UserExportBundle | null>(null);
  const [jsonFileName, setJsonFileName] = useState("");
  const [jsonExportBusy, setJsonExportBusy] = useState(false);
  const [jsonAccountResult, setJsonAccountResult] = useState<AccountImportApiResult | null>(null);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: dataExportStepUp } = useQuery({
    queryKey: ["/api/account/data-export-step-up-status"],
    queryFn: async () => {
      const res = await fetch("/api/account/data-export-step-up-status", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load verification status");
      return res.json() as Promise<{
        stepUpRequired: boolean;
        stepUpSatisfied: boolean;
        expiresAt: number | null;
      }>;
    },
    staleTime: 15_000,
  });

  const accountDataStepUpBlocks =
    Boolean(dataExportStepUp?.stepUpRequired) && !dataExportStepUp?.stepUpSatisfied;

  const verifyDataExportStepUpMutation = useMutation({
    mutationFn: async (payload: { challengeId: string; code: string }) => {
      const res = await apiRequest("POST", "/api/account/data-export-step-up", payload);
      return res.json() as Promise<{ ok?: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/account/data-export-step-up-status"] });
      setDataExportMfaOpen(false);
      setDataExportChallenge(null);
      toast({
        title: "Verified",
        description: "You can download or import your JSON account backup for the next hour.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const startDataExportVerification = async () => {
    try {
      const c = await requestDataExportChallenge(MFA_PURPOSES.ACCOUNT_DATA_EXPORT);
      setDataExportChallenge({
        challengeId: c.challengeId,
        expiresAt: c.expiresAt,
        devCode: c.devCode,
        maskedDestination: c.maskedDestination,
      });
      setDataExportMfaOpen(true);
      toast({ title: "Code sent", description: "Check your email for the verification code." });
    } catch (e) {
      toast({
        title: "Could not send code",
        description: e instanceof Error ? e.message : "Try again later.",
        variant: "destructive",
      });
    }
  };

  function invalidateAfterAccountImport() {
    void queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/my-rewards"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/badges"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/classification-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/classification/categories"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/account/profile"] });
  }

  const accountJsonMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!jsonBundle) throw new Error("No backup loaded");
      if (accountDataStepUpBlocks) {
        throw new Error("Verify your identity first (email code) before importing a JSON backup.");
      }
      const res = await apiRequest("POST", "/api/account/import", { bundle: jsonBundle, dryRun });
      return (await res.json()) as AccountImportApiResult;
    },
    onSuccess: (data, dryRun) => {
      setJsonAccountResult(data);
      if (!dryRun && data.success) {
        invalidateAfterAccountImport();
        setJsonBundle(null);
        setJsonFileName("");
        if (jsonInputRef.current) jsonInputRef.current.value = "";
        toast({
          title: "Backup import finished",
          description: "Your account data from the JSON file has been merged.",
        });
      } else if (!dryRun && !data.success) {
        toast({
          title: "Backup import failed",
          description: data.errors?.[0]?.message ?? "See details below.",
          variant: "destructive",
        });
      } else if (dryRun) {
        toast({
          title: data.success ? "Dry run OK" : "Dry run reported issues",
          description: data.success
            ? "Review counts below, then run a real import if it looks right."
            : (data.errors?.[0]?.message ?? "Check errors below."),
          variant: data.success ? "default" : "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "JSON import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleExportJsonBundle = async () => {
    if (accountDataStepUpBlocks) {
      toast({
        title: "Verification required",
        description: "Request a code and confirm your email before downloading your JSON backup.",
        variant: "destructive",
      });
      return;
    }
    setJsonExportBusy(true);
    try {
      const res = await apiRequest("GET", "/api/account/export");
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      let url: string | undefined;
      try {
        url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `my-axtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        toast({
          title: "JSON backup downloaded",
          description: "Includes tasks, wallet, badges, and related data for restore or portability.",
        });
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not download backup.",
        variant: "destructive",
      });
    } finally {
      setJsonExportBusy(false);
    }
  };

  const handleJsonFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setJsonAccountResult(null);
    const reader = new FileReader();
    reader.onerror = () => {
      const detail = reader.error?.message?.trim() || "Could not read this file.";
      toast({
        title: "Could not read file",
        description: detail,
        variant: "destructive",
      });
      setJsonBundle(null);
      setJsonFileName("");
    };
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!isUserExportBundle(parsed)) {
          toast({
            title: "Not a user backup",
            description: "Use an AxTask JSON export with exportMode \"user\" (Download JSON backup).",
            variant: "destructive",
          });
          setJsonBundle(null);
          setJsonFileName("");
          return;
        }
        setJsonBundle(parsed);
        setJsonFileName(file.name);
        const tc = parsed.metadata.tableCounts?.tasks;
        toast({
          title: "Backup loaded",
          description:
            typeof tc === "number"
              ? `${file.name} — ${tc.toLocaleString()} tasks in file. Run a dry run before importing.`
              : `${file.name} ready. Run a dry run before importing.`,
        });
      } catch (e) {
        const detail = e instanceof Error && e.message ? e.message : "Could not parse this file.";
        toast({
          title: "Invalid JSON",
          description: detail,
          variant: "destructive",
        });
        setJsonBundle(null);
        setJsonFileName("");
      }
    };
    reader.readAsText(file);
  };

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
    
    if (!isCSV && !isExcel) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV or Excel file.",
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    setImportResult(null);
    setSheets([]);

    try {
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
        const content = await file.text();
        const parsed = parseTasksFromCSV(content);
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
      const CHUNK_SIZE = 2000;
      let totalImported = 0;
      let totalFailed = 0;
      let totalSkipped = 0;

      for (let i = 0; i < allTasks.length; i += CHUNK_SIZE) {
        const chunk = allTasks.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(allTasks.length / CHUNK_SIZE);

        setImportMessage(`Sending batch ${chunkNum} of ${totalChunks} (${chunk.length} tasks)...`);

        const response = await apiRequest("POST", "/api/tasks/import", { tasks: chunk });
        const result = await response.json();

        totalImported += result.imported;
        totalFailed += result.failed;
        totalSkipped += result.skippedAsDuplicate || 0;

        const progress = Math.round(((i + chunk.length) / allTasks.length) * 100);
        setImportProgress(progress);
      }

      setImportResult({ imported: totalImported, failed: totalFailed, skippedAsDuplicate: totalSkipped, total: allTasks.length });
      setImportMessage(`Done! ${totalImported} tasks imported successfully.`);

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });

      toast({
        title: "Import complete",
        description: `${totalImported} imported${totalSkipped > 0 ? `, ${totalSkipped} skipped as duplicates` : ""}${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`,
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

  const csvTemplate = `${formatAxTaskCsvAttribution()}
Date,Activity,Notes,Urgency,Impact,Effort,Prerequisites,Status
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

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Import/Export</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
          Google Sheets–friendly CSV/Excel plus a full JSON backup. Same task (date, time, activity, notes) is deduplicated across both.
        </p>
      </div>

      <MfaVerificationPanel
        open={dataExportMfaOpen}
        challengeId={dataExportChallenge?.challengeId}
        purpose={MFA_PURPOSES.ACCOUNT_DATA_EXPORT}
        title="Verify for account backup"
        description={
          dataExportChallenge?.maskedDestination
            ? `Code sent to ${dataExportChallenge.maskedDestination}`
            : "Enter the code we email you."
        }
        expiresAt={dataExportChallenge?.expiresAt}
        devCode={dataExportChallenge?.devCode ?? null}
        isBusy={verifyDataExportStepUpMutation.isPending}
        onDismiss={() => {
          setDataExportMfaOpen(false);
          setDataExportChallenge(null);
        }}
        onResend={() => void startDataExportVerification()}
        onSubmitCode={async (code) => {
          if (!dataExportChallenge?.challengeId) return;
          await verifyDataExportStepUpMutation.mutateAsync({
            challengeId: dataExportChallenge.challengeId,
            code,
          });
        }}
      />

      {accountDataStepUpBlocks ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100 mb-2">
            Email verification required for JSON account backup
          </p>
          <p className="text-amber-900/90 dark:text-amber-200/90 mb-3">
            In production, downloading or importing your full JSON backup requires a one-time code (same idea as billing
            verification).
          </p>
          <Button type="button" size="sm" onClick={() => void startDataExportVerification()} disabled={dataExportCodeSending}>
            {dataExportCodeSending ? "Sending…" : "Email me a code"}
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="mr-2 h-5 w-5" />
              Export Tasks
            </CardTitle>
            <CardDescription>
              CSV for spreadsheets, or JSON for a full portable backup (tasks, wallet, badges, patterns, and more).
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
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void handleExportJsonBundle()}
              disabled={jsonExportBusy || accountDataStepUpBlocks}
            >
              {jsonExportBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCode className="mr-2 h-4 w-4" />
              )}
              Download JSON backup
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
              Import from a spreadsheet, from a JSON backup, or both—overlapping tasks match on date, time, activity, and notes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div>
                <div className="text-sm font-semibold">Spreadsheet (CSV / Excel)</div>
                <p className="text-xs text-muted-foreground">Google Sheets export or CSV template</p>
              </div>
              <Label htmlFor="csv-file" className="sr-only">
                Spreadsheet file
              </Label>
              <Input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                disabled={isImporting || isParsing || accountJsonMutation.isPending}
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
              <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    Import Complete
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="font-bold text-lg text-green-700 dark:text-green-300">
                      {importResult.imported.toLocaleString()}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">Imported</div>
                  </div>
                  <div>
                    <div className="font-bold text-lg text-red-600">
                      {importResult.failed.toLocaleString()}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">Failed</div>
                  </div>
                  <div>
                    <div className="font-bold text-lg text-amber-600">
                      {(importResult.skippedAsDuplicate || 0).toLocaleString()}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">Skipped</div>
                  </div>
                  <div>
                    <div className="font-bold text-lg text-gray-700 dark:text-gray-300">
                      {importResult.total.toLocaleString()}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">Total</div>
                  </div>
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
                    <li>Priority and classification are auto-calculated after import</li>
                    <li>
                      JSON backup and spreadsheet imports share the same task fingerprint; order does not matter for duplicate tasks
                    </li>
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

            <Separator className="my-2" />

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Full account backup (JSON)</Label>
              <p className="text-xs text-muted-foreground">
                Use the same format as &quot;Download JSON backup&quot;. Run a dry run first; large files (many thousands of tasks) can take a minute.
              </p>
              <div className="space-y-2">
                <Label htmlFor="json-backup-file" className="text-xs font-normal text-muted-foreground">
                  AxTask user export (.json)
                </Label>
                <Input
                  id="json-backup-file"
                  ref={jsonInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleJsonFileSelect}
                  disabled={isImporting || isParsing || accountJsonMutation.isPending || accountDataStepUpBlocks}
                />
              </div>
              {jsonFileName ? (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Loaded: <span className="font-medium">{jsonFileName}</span>
                  {jsonBundle?.metadata.tableCounts?.tasks != null
                    ? ` — ${Number(jsonBundle.metadata.tableCounts.tasks).toLocaleString()} tasks in bundle`
                    : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!jsonBundle || accountJsonMutation.isPending || accountDataStepUpBlocks}
                  onClick={() => accountJsonMutation.mutate(true)}
                >
                  {accountJsonMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Dry run
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!jsonBundle || accountJsonMutation.isPending || accountDataStepUpBlocks}
                  onClick={() => accountJsonMutation.mutate(false)}
                >
                  Import JSON backup
                </Button>
              </div>
              {jsonAccountResult ? (
                <div
                  className={`rounded-lg border p-3 text-xs space-y-2 ${
                    jsonAccountResult.success
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  }`}
                >
                  <div className="font-medium">
                    {jsonAccountResult.dryRun ? "Dry run" : "Import"} —{" "}
                    {jsonAccountResult.success ? "completed" : "see errors"}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(jsonAccountResult.inserted || {}).map(([k, v]) => (
                      <div key={`ins-${k}`}>
                        <span className="text-muted-foreground">{k}: </span>
                        <span className="font-mono">{String(v)}</span>{" "}
                        {jsonAccountResult.dryRun ? "would insert" : "inserted"}
                      </div>
                    ))}
                    {Object.entries(jsonAccountResult.skipped || {}).some(([, v]) => v > 0) ? (
                      <div className="col-span-full text-amber-800 dark:text-amber-200">
                        Skipped rows (already present or unresolved links):{" "}
                        {Object.entries(jsonAccountResult.skipped || {})
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")}
                      </div>
                    ) : null}
                  </div>
                  {jsonAccountResult.errors?.length ? (
                    <ul className="list-disc list-inside text-red-700 dark:text-red-300 max-h-32 overflow-y-auto">
                      {jsonAccountResult.errors.slice(0, 8).map((e, i) => (
                        <li key={i}>
                          {e.table} — {e.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

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

            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Tip:</strong> The priority scoring engine from your Google Apps Script 
                is built into AxTask, so your tasks will have consistent priority scoring.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>JSON + Sheets:</strong> Keep using your repo spreadsheet for day-to-day capture; use JSON for full backups.
                Import either first; matching rows are merged by task content, not by row position.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
