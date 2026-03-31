import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Task, type InsertTask } from "@shared/schema";
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
import { Upload, Download, FileText, AlertCircle, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface SheetInfo {
  sheetName: string;
  tasks: any[];
  rowCount: number;
  selected: boolean;
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
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: number;
    total: number;
  } | null>(null);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
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

      for (let i = 0; i < allTasks.length; i += CHUNK_SIZE) {
        const chunk = allTasks.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(allTasks.length / CHUNK_SIZE);

        setImportMessage(`Sending batch ${chunkNum} of ${totalChunks} (${chunk.length} tasks)...`);

        const response = await apiRequest("POST", "/api/tasks/import", { tasks: chunk });
        const result = await response.json();

        totalImported += result.imported;
        totalFailed += result.failed;

        const progress = Math.round(((i + chunk.length) / allTasks.length) * 100);
        setImportProgress(progress);
      }

      setImportResult({ imported: totalImported, failed: totalFailed, total: allTasks.length });
      setImportMessage(`Done! ${totalImported} tasks imported successfully.`);

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });

      toast({
        title: "Import complete",
        description: `${totalImported} tasks imported${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`,
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
              Upload a CSV or Excel file to import tasks. Supports your Google Sheets task tracker format.
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
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
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
