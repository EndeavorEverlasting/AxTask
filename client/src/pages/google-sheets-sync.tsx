import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  GoogleSheetsSync as GoogleSheetsSyncService,
  googleSheetsUtils,
  type GoogleSheetsConfig,
  type SyncStatus
} from "@/lib/google-sheets-sync";
import {
  googleSheetsClient,
  googleAuthUtils,
  type GoogleAuthTokens
} from "@/lib/google-api";
import {
  FileSpreadsheet,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Share2,
  HelpCircle,
  Settings,
  Zap,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { type Task } from "@shared/schema";

export default function GoogleSheetsSyncPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Check configuration status
  const { data: configStatus } = useQuery({
    queryKey: ['google-sheets-config'],
    queryFn: async () => {
      const response = await fetch('/api/google-sheets/config-status');
      if (!response.ok) {
        // Handle cases where the API endpoint might not be ready or returns an error
        console.error("Failed to fetch config status:", response.statusText);
        return { isConfigured: false, missingSecrets: [], redirectUri: null };
      }
      return response.json();
    }
  });

  const [config, setConfig] = useState<GoogleSheetsConfig>({
    sheetName: "Task Tracker",
    lastSyncTime: "",
    autoSyncEnabled: false,
    syncInterval: 30 // minutes
  });

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isActive: false,
    lastSync: null,
    nextSync: null,
    pendingChanges: 0,
    conflictCount: 0
  });

  const [showInstructions, setShowInstructions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [authTokens, setAuthTokens] = useState<GoogleAuthTokens | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const googleSheetsSync = new GoogleSheetsSyncService(config);

  useEffect(() => {
    // Load saved configuration
    const savedConfig = localStorage.getItem('googleSheetsConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setConfig(parsed);
    }

    // Update sync status
    setSyncStatus(googleSheetsSync.getSyncStatus());
  }, []);

  useEffect(() => {
    // Save configuration changes
    localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
    googleSheetsSync.updateConfig(config);
    setSyncStatus(googleSheetsSync.getSyncStatus());
  }, [config]);

  const handleExportToGoogleSheets = async () => {
    setIsExporting(true);
    try {
      const csvContent = GoogleSheetsSyncService.formatForGoogleSheets(tasks);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.sheetName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Update last sync time
      setConfig(prev => ({
        ...prev,
        lastSyncTime: new Date().toISOString()
      }));

      toast({
        title: "Export completed",
        description: `${tasks.length} tasks exported to Google Sheets format. Import this file to your Google Sheet.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to generate Google Sheets export",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfigChange = (field: keyof GoogleSheetsConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getTimeSinceLastSync = (): string => {
    if (!config.lastSyncTime) return "Never synced";

    const lastSync = new Date(config.lastSyncTime);
    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      return `${Math.floor(diffHours / 24)} days ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hours ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minutes ago`;
    } else {
      return "Just now";
    }
  };

  const storedTokens = localStorage.getItem("googleAuthTokens");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Google Sheets Sync</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Seamless integration with your Google Sheets workflow - no API keys required
        </p>
      </div>

      {/* Configuration Status Banner */}
      {!configStatus?.isConfigured && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Setup Required</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Google API credentials need to be configured in Replit Secrets:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {configStatus?.missingSecrets?.map((secret: string) => (
                <li key={secret}><code className="bg-muted px-1 rounded">{secret}</code></li>
              ))}
            </ul>
            <p className="text-sm mt-2">
              Auto-detected redirect URI: <code className="bg-muted px-1 rounded text-xs">{configStatus?.redirectUri}</code>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              See the <a href="/docs/GOOGLE_SHEETS_SETUP.md" className="underline" target="_blank" rel="noopener noreferrer">setup guide</a> for detailed instructions.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {configStatus?.isConfigured && !storedTokens && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Ready to Connect</AlertTitle>
          <AlertDescription>
            <p>Google API is configured. Click "Authenticate with Google" below to connect your account.</p>
            <p className="text-xs text-muted-foreground mt-1">Redirect URI: {configStatus.redirectUri}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Last Sync</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {getTimeSinceLastSync()}
                </p>
              </div>
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                <Clock className="text-blue-600 h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Tasks Ready</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {tasks.length}
                </p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                <FileSpreadsheet className="text-green-600 h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Sync Status</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {config.autoSyncEnabled ? "Active" : "Manual"}
                </p>
              </div>
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg">
                <Zap className="text-purple-600 h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <RefreshCw className="mr-2 h-5 w-5" />
            Quick Sync Actions
          </CardTitle>
          <CardDescription>
            Export your tasks to Google Sheets or import updates from your sheet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleExportToGoogleSheets}
              disabled={isExporting || !configStatus?.isConfigured || !storedTokens}
              className="flex items-center"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Exporting..." : "Export to Google Sheets"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                window.location.href = '/import-export';
              }}
              disabled={!configStatus?.isConfigured || !storedTokens}
              className="flex items-center"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import from Google Sheets
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              {showInstructions ? "Hide" : "Show"} Instructions
            </Button>

            {!storedTokens && configStatus?.isConfigured && (
              <Button
                variant="default"
                onClick={() => {
                  window.location.href = '/api/google-sheets/auth';
                }}
                className="flex items-center bg-blue-600 hover:bg-blue-700 text-white"
              >
                <LinkIcon className="mr-2 h-4 w-4" />
                Authenticate with Google
              </Button>
            )}
          </div>

          {showInstructions && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="whitespace-pre-line text-sm">
                  {GoogleSheetsSyncService.generateSyncInstructions()}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="mr-2 h-5 w-5" />
            Sync Configuration
          </CardTitle>
          <CardDescription>
            Customize your Google Sheets integration settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sheetName">Google Sheet Name</Label>
            <Input
              id="sheetName"
              value={config.sheetName}
              onChange={(e) => handleConfigChange('sheetName', e.target.value)}
              placeholder="Task Tracker"
              disabled={!storedTokens}
            />
            <p className="text-xs text-gray-500">Used for exported file names</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autoSync">Auto-sync Reminders</Label>
              <p className="text-xs text-gray-500">
                Get reminders to sync with Google Sheets
              </p>
            </div>
            <Switch
              id="autoSync"
              checked={config.autoSyncEnabled}
              onCheckedChange={(checked) => handleConfigChange('autoSyncEnabled', checked)}
              disabled={!storedTokens}
            />
          </div>

          {config.autoSyncEnabled && (
            <div className="space-y-2">
              <Label htmlFor="syncInterval">Reminder Interval (minutes)</Label>
              <Input
                id="syncInterval"
                type="number"
                min="5"
                max="1440"
                value={config.syncInterval}
                onChange={(e) => handleConfigChange('syncInterval', parseInt(e.target.value) || 30)}
                disabled={!storedTokens}
              />
              <p className="text-xs text-gray-500">
                How often to remind you to sync (5 minutes to 24 hours)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sharing Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Share2 className="mr-2 h-5 w-5" />
            Team Collaboration
          </CardTitle>
          <CardDescription>
            Share your Google Sheet with team members for collaborative task management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={googleSheetsUtils.generateShareInstructions(config.sheetName)}
            className="min-h-32 text-xs font-mono"
            disabled={!storedTokens}
          />
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Track your Google Sheets synchronization history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {config.lastSyncTime ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <span className="text-sm">Last export to Google Sheets</span>
                </div>
                <Badge variant="outline">
                  {new Date(config.lastSyncTime).toLocaleString()}
                </Badge>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FileSpreadsheet className="h-8 w-8 mx-auto mb-2" />
                <p>No sync history yet</p>
                <p className="text-xs">Export your first file to get started</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}