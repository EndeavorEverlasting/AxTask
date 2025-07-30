import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Task, type InsertTask } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { tasksToCSV, parseTasksFromCSV, downloadCSV, parseTasksFromExcel } from "@/lib/csv-utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileText, AlertCircle, Clock, DollarSign } from "lucide-react";

export default function ImportExport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importStats, setImportStats] = useState({
    totalTasks: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    estimatedTime: 0,
    estimatedCost: 0,
    startTime: 0,
    elapsedTime: 0
  });

  // Calculate costs and time estimates
  const calculateImportEstimates = (taskCount: number) => {
    // Estimates based on server processing
    const avgProcessingTimePerTask = 150; // ms per task (database insert + priority calculation)
    const serverCostPerHour = 0.02; // Estimated server cost per hour
    const totalTimeMs = taskCount * avgProcessingTimePerTask;
    const totalTimeHours = totalTimeMs / (1000 * 60 * 60);
    
    return {
      estimatedTimeMs: totalTimeMs,
      estimatedTimeSec: Math.ceil(totalTimeMs / 1000),
      estimatedCost: Math.round(totalTimeHours * serverCostPerHour * 1000) / 1000 // Round to 3 decimal places
    };
  };

  // Update elapsed time during import
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isImporting && importStats.startTime > 0) {
      interval = setInterval(() => {
        setImportStats(prev => ({
          ...prev,
          elapsedTime: Date.now() - prev.startTime
        }));
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isImporting, importStats.startTime]);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const createTaskMutation = useMutation({
    mutationFn: async (task: InsertTask) => {
      const response = await apiRequest("POST", "/api/tasks", task);
      return response.json();
    },
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

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    setIsImporting(true);

    try {
      let importedTasks: any[] = [];
      
      if (isCSV) {
        const content = await file.text();
        importedTasks = parseTasksFromCSV(content);
      } else if (isExcel) {
        importedTasks = await parseTasksFromExcel(file);
      }

      if (importedTasks.length === 0) {
        toast({
          title: "No valid tasks found",
          description: "The CSV file doesn't contain any valid task data.",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      // Calculate and display cost/time estimates
      const estimates = calculateImportEstimates(importedTasks.length);
      setImportStats({
        totalTasks: importedTasks.length,
        processed: 0,
        successful: 0,
        failed: 0,
        estimatedTime: estimates.estimatedTimeSec,
        estimatedCost: estimates.estimatedCost,
        startTime: Date.now(),
        elapsedTime: 0
      });

      // Show cost/time warning for large imports
      if (importedTasks.length > 20) {
        const proceed = window.confirm(
          `📊 IMPORT COST ANALYSIS\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Tasks to import: ${importedTasks.length}\n` +
          `Estimated time: ${estimates.estimatedTimeSec} seconds (${Math.ceil(estimates.estimatedTimeSec/60)} min)\n` +
          `Estimated server cost: $${estimates.estimatedCost}\n` +
          `Processing rate: ~${Math.round(importedTasks.length/estimates.estimatedTimeSec)} tasks/second\n\n` +
          `💡 RECOMMENDATION:\n` +
          `${importedTasks.length > 100 ? 
            '⚠️  Large import - consider splitting into smaller files' : 
            '✅ Reasonable size for single import'}\n\n` +
          `Continue with import?`
        );
        
        if (!proceed) {
          setIsImporting(false);
          return;
        }
      }

      // Import tasks one by one with progress tracking and logging
      let successCount = 0;
      let errorCount = 0;

      // Add initial log
      setImportLogs([`🚀 Starting import of ${importedTasks.length} tasks...`]);

      for (let i = 0; i < importedTasks.length; i++) {
        const task = importedTasks[i];
        const taskNumber = i + 1;
        
        try {
          // Log current task being processed
          setImportLogs(prev => [...prev, `⏳ Processing task ${taskNumber}/${importedTasks.length}: "${task.activity?.substring(0, 40) || 'Untitled'}${task.activity?.length > 40 ? '...' : ''}"`]);
          
          await createTaskMutation.mutateAsync(task);
          successCount++;
          
          // Log success
          setImportLogs(prev => [...prev, `✅ Task ${taskNumber} imported successfully`]);
        } catch (error) {
          errorCount++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          
          // Log failure with details
          setImportLogs(prev => [...prev, `❌ Task ${taskNumber} failed: ${errorMsg}`]);
          console.error("Failed to import task:", task, error);
        }

        // Update progress
        const processed = taskNumber;
        const progressPercent = (processed / importedTasks.length) * 100;
        setImportProgress(progressPercent);
        setImportStats(prev => ({
          ...prev,
          processed,
          successful: successCount,
          failed: errorCount
        }));

        // Add cost/time updates every 10 tasks
        if (taskNumber % 10 === 0) {
          const elapsedSeconds = Math.round((Date.now() - importStats.startTime) / 1000);
          const estimatedRemaining = Math.round((importedTasks.length - taskNumber) * (elapsedSeconds / taskNumber));
          setImportLogs(prev => [...prev, `📊 Progress: ${Math.round(progressPercent)}% • ${elapsedSeconds}s elapsed • ~${estimatedRemaining}s remaining`]);
        }

        // Add small delay to prevent overwhelming the server
        if (i < importedTasks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Final log
      const finalElapsed = Math.round((Date.now() - importStats.startTime) / 1000);
      setImportLogs(prev => [...prev, `🎉 Import completed! ${successCount} successful, ${errorCount} failed in ${finalElapsed}s`]);

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });

      const actualTimeSeconds = Math.round((Date.now() - importStats.startTime) / 1000);
      const actualCost = Math.round((actualTimeSeconds / 3600) * 0.02 * 1000) / 1000;
      
      toast({
        title: "Import completed",
        description: `✅ ${successCount} tasks imported successfully\n` +
                    `${errorCount > 0 ? `❌ ${errorCount} tasks failed\n` : ''}` +
                    `⏱️ Completed in ${actualTimeSeconds}s (estimated ${importStats.estimatedTime}s)\n` +
                    `💰 Actual cost: $${actualCost} (estimated $${importStats.estimatedCost})`,
      });

    } catch (error) {
      toast({
        title: "Import failed",
        description: "Failed to parse CSV file. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      // Keep logs visible for a few seconds after completion
      setTimeout(() => {
        setIsImporting(false);
        setImportProgress(0);
        setImportLogs([]);
        setImportStats({
          totalTasks: 0,
          processed: 0,
          successful: 0,
          failed: 0,
          estimatedTime: 0,
          estimatedCost: 0,
          startTime: 0,
          elapsedTime: 0
        });
      }, 3000);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

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
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import/Export</h2>
        <p className="text-gray-600 dark:text-gray-400">Sync your tasks with Google Sheets or other tools</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Section */}
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

        {/* Import Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Upload className="mr-2 h-5 w-5" />
              Import Tasks
            </CardTitle>
            <CardDescription>
              Upload a CSV file to import tasks from Google Sheets or other sources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Choose CSV File</Label>
              <Input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImport}
                disabled={isImporting}
              />
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="mr-2 h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-900 dark:text-yellow-100">
                  <p className="font-medium mb-1">CSV Format Requirements:</p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    <li>Required: Date, Activity</li>
                    <li>Optional: Notes, Urgency (1-5), Impact (1-5), Effort (1-5), Prerequisites, Status</li>
                    <li>Priority and Classification will be auto-calculated</li>
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

            {isImporting && (
              <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="mr-2 h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Importing tasks...
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <Badge variant="outline" className="flex items-center">
                      <Clock className="mr-1 h-3 w-3" />
                      {Math.round(importStats.elapsedTime / 1000)}s / {importStats.estimatedTime}s
                    </Badge>
                    <Badge variant="outline" className="flex items-center">
                      <DollarSign className="mr-1 h-3 w-3" />
                      ${importStats.estimatedCost}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-blue-800 dark:text-blue-200">
                    <span>{importStats.processed} / {importStats.totalTasks} tasks</span>
                    <span>{Math.round(importProgress)}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span>Success: {importStats.successful}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                    <span>Failed: {importStats.failed}</span>
                  </div>
                </div>

                {importStats.totalTasks > 50 && (
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    💡 Tip: For faster imports, consider splitting large files into smaller chunks
                  </div>
                )}

                {importLogs.length > 0 && (
                  <div className="bg-gray-900 dark:bg-gray-800 rounded-md p-3 max-h-32 overflow-y-auto">
                    <div className="text-xs font-mono text-green-400 space-y-1">
                      {importLogs.slice(-8).map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap">{log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Google Sheets Integration Guide */}
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
                <li>Go to File → Import → Upload and select your CSV file</li>
                <li>Choose "Replace spreadsheet" and click "Import data"</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-semibold text-sm mb-2">To import from Google Sheets:</h4>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                <li>In your Google Sheet, go to File → Download → Comma-separated values (.csv)</li>
                <li>Use the "Choose CSV File" button above to upload the downloaded file</li>
                <li>Tasks will be automatically processed and priority scores calculated</li>
              </ol>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Tip:</strong> The original Google Apps Script priority calculation logic is preserved, 
                so your tasks will maintain consistent priority scoring across both platforms.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
