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
import { Upload, Download, FileText, AlertCircle, AlertTriangle, CheckCircle2, Loader2, History, ShieldAlert, SkipForward } from "lucide-react";

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

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: importHistoryData = [] } = useQuery<ImportHistory[]>({
    queryKey: ["/api/import-history"],
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
      const CHUNK_SIZE = 2000;
      let totalImported = 0;
      let totalForceImported = 0;
      let totalSkippedCompleted = 0;
      let totalSkippedDuplicate = 0;
      let totalFailed = 0;
      let lastFileWarning: string | null = null;

      for (let i = 0; i < allTasks.length; i += CHUNK_SIZE) {
        const chunk = allTasks.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(allTasks.length / CHUNK_SIZE);

        setImportMessage(`Sending batch ${chunkNum} of ${totalChunks} (${chunk.length} tasks)...`);

        const response = await apiRequest("POST", "/api/tasks/import", {
          tasks: chunk,
          forceImport,
          fileName,
          fileContent: i === 0 ? fileContent : undefined,
        });
        const result = await response.json();

        totalImported += result.imported || 0;
        totalForceImported += result.forceImported || 0;
        totalSkippedCompleted += result.skippedCompleted || 0;
        totalSkippedDuplicate += result.skippedDuplicate || 0;
        totalFailed += result.failed || 0;
        if (result.fileWarning) lastFileWarning = result.fileWarning;

        const progress = Math.round(((i + chunk.length) / allTasks.length) * 100);
        setImportProgress(progress);
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

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Import/Export</h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Sync your tasks with Google Sheets or other tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="mr-2 h-5 w-5" />
              Export Tasks
            </CardTitle>
            <CardDescription>
              Download your tasks as a CSV file for use in Google Sheets or other applications.
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
              Upload a CSV or Excel file to import tasks. Duplicates are automatically detected and skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Choose File</Label>
              <Input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
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
    </div>
  );
}
