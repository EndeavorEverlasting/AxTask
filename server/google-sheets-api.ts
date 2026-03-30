import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { type Task } from '@shared/schema';

export interface GoogleSheetsCredentials {
  apiKey: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface SyncResult {
  success: boolean;
  tasksUpdated: number;
  tasksCreated: number;
  errors: string[];
  lastSyncTime: string;
}

export interface SpreadsheetInfo {
  id: string;
  title: string;
  sheets: Array<{
    id: number;
    title: string;
    rowCount: number;
    columnCount: number;
  }>;
}

export class GoogleSheetsAPI {
  private sheets: any;
  private auth: OAuth2Client;
  private apiKey: string;

  constructor(credentials: GoogleSheetsCredentials) {
    this.apiKey = credentials.apiKey;
    
    // Validate credentials format
    if (!credentials.apiKey.startsWith('AIza')) {
      throw new Error('Invalid API key format');
    }
    
    // Initialize OAuth2 client
    this.auth = new OAuth2Client(
      credentials.clientId,
      credentials.clientSecret,
      `${process.env.BASE_URL || 'http://localhost:5000'}/auth/callback`
    );

    // Set credentials if available
    if (credentials.accessToken) {
      this.auth.setCredentials({
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
      });
    }

    // Initialize Google Sheets API
    this.sheets = google.sheets({ 
      version: 'v4', 
      auth: this.auth,
      key: this.apiKey 
    });
  }

  // Generate OAuth URL for user authentication
  generateAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];

    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  // Exchange authorization code for tokens
  async getTokens(code: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const { tokens } = await this.auth.getToken(code);
      this.auth.setCredentials(tokens);
      
      return {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!
      };
    } catch (error) {
      throw new Error(`Failed to exchange authorization code: ${error}`);
    }
  }

  // Get spreadsheet information
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetInfo> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: false
      });

      const spreadsheet = response.data;
      return {
        id: spreadsheet.spreadsheetId,
        title: spreadsheet.properties.title,
        sheets: spreadsheet.sheets.map((sheet: any) => ({
          id: sheet.properties.sheetId,
          title: sheet.properties.title,
          rowCount: sheet.properties.gridProperties.rowCount,
          columnCount: sheet.properties.gridProperties.columnCount
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get spreadsheet info: ${error}`);
    }
  }

  // Create a new spreadsheet with task template
  async createTaskSpreadsheet(title: string): Promise<string> {
    try {
      const response = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: title
          },
          sheets: [{
            properties: {
              title: 'Tasks',
              gridProperties: {
                rowCount: 1000,
                columnCount: 12
              }
            }
          }]
        }
      });

      const spreadsheetId = response.data.spreadsheetId!;

      // Add headers
      const headers = [
        'Date', 'Activity', 'Notes', 'Priority', 'Classification', 
        'Score', 'Urgency', 'Impact', 'Effort', 'Prerequisites', 
        'Status', 'Last Updated'
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Tasks!A1:L1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers]
        }
      });

      // Format header row
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                  textFormat: { 
                    bold: true, 
                    foregroundColor: { red: 1, green: 1, blue: 1 }
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }]
        }
      });

      return spreadsheetId;
    } catch (error) {
      throw new Error(`Failed to create spreadsheet: ${error}`);
    }
  }

  // Export tasks to Google Sheets
  async exportTasks(spreadsheetId: string, tasks: Task[], sheetName = 'Tasks'): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      tasksUpdated: 0,
      tasksCreated: 0,
      errors: [],
      lastSyncTime: new Date().toISOString()
    };

    try {
      // Format tasks for Google Sheets
      const formattedTasks = this.formatTasksForSheets(tasks);

      // Clear existing data (except headers)
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A2:L`
      });

      // Insert new data
      if (formattedTasks.length > 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A2:L${formattedTasks.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: formattedTasks
          }
        });

        result.tasksCreated = formattedTasks.length;
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`Export failed: ${error}`);
    }

    return result;
  }

  // Import tasks from Google Sheets
  async importTasks(spreadsheetId: string, sheetName = 'Tasks'): Promise<Task[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A2:L`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const rows = response.data.values || [];
      return this.parseTasksFromSheets(rows);
    } catch (error) {
      throw new Error(`Failed to import tasks: ${error}`);
    }
  }

  // Sync tasks bidirectionally
  async syncTasks(
    spreadsheetId: string, 
    localTasks: Task[], 
    sheetName = 'Tasks'
  ): Promise<{ 
    imported: Task[]; 
    exported: SyncResult; 
    conflicts: Array<{ local: Task; remote: Task; reason: string }> 
  }> {
    try {
      // Import remote tasks
      const remoteTasks = await this.importTasks(spreadsheetId, sheetName);
      
      // Detect conflicts and merge
      const { merged, conflicts } = this.mergeTaskLists(localTasks, remoteTasks);
      
      // Export merged tasks back to sheets
      const exportResult = await this.exportTasks(spreadsheetId, merged, sheetName);

      return {
        imported: remoteTasks,
        exported: exportResult,
        conflicts
      };
    } catch (error) {
      throw new Error(`Sync failed: ${error}`);
    }
  }

  // Format tasks for Google Sheets display
  private formatTasksForSheets(tasks: Task[]): string[][] {
    return tasks.map(task => [
      task.date,
      task.activity,
      task.notes || '',
      this.formatPriority(task.priority),
      task.classification || 'General',
      (task.priorityScore / 10).toFixed(1),
      task.urgency?.toString() || '',
      task.impact?.toString() || '',
      task.effort?.toString() || '',
      task.prerequisites || '',
      task.status === 'completed' ? 'TRUE' : 'FALSE',
      new Date(task.updatedAt || task.createdAt || new Date()).toLocaleDateString()
    ]);
  }

  // Parse tasks from Google Sheets format
  private parseTasksFromSheets(rows: any[][]): Task[] {
    return rows
      .filter(row => row.length > 0 && row[0] && row[1]) // Must have date and activity
      .map((row, index) => {
        try {
          return {
            id: `sheet-${index}`, // Temporary ID for import
            date: this.parseDate(row[0]),
            activity: row[1] || '',
            notes: row[2] || null,
            priority: this.parsePriority(row[3]),
            classification: row[4] || 'General',
            priorityScore: this.parseScore(row[5]),
            urgency: this.parseNumber(row[6], 1, 5),
            impact: this.parseNumber(row[7], 1, 5),
            effort: this.parseNumber(row[8], 1, 5),
            prerequisites: row[9] || null,
            status: this.parseStatus(row[10]),
            isRepeated: false,
            createdAt: new Date(),
            updatedAt: new Date()
          } as Task;
        } catch (error) {
          console.warn(`Failed to parse row ${index}:`, error);
          return null;
        }
      })
      .filter(task => task !== null) as Task[];
  }

  // Merge local and remote task lists, detecting conflicts
  private mergeTaskLists(
    localTasks: Task[], 
    remoteTasks: Task[]
  ): { 
    merged: Task[]; 
    conflicts: Array<{ local: Task; remote: Task; reason: string }> 
  } {
    const conflicts: Array<{ local: Task; remote: Task; reason: string }> = [];
    const merged: Task[] = [...localTasks];
    
    // Create lookup map for local tasks
    const localMap = new Map(
      localTasks.map(task => [this.createTaskKey(task), task])
    );

    // Process remote tasks
    remoteTasks.forEach(remoteTask => {
      const key = this.createTaskKey(remoteTask);
      const localTask = localMap.get(key);

      if (!localTask) {
        // New task from remote
        merged.push({
          ...remoteTask,
          id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        });
      } else {
        // Check for conflicts
        const localModified = new Date(localTask.updatedAt || localTask.createdAt || new Date());
        const remoteModified = new Date(remoteTask.updatedAt || remoteTask.createdAt || new Date());

        if (this.hasTaskChanges(localTask, remoteTask)) {
          if (localModified > remoteModified) {
            conflicts.push({
              local: localTask,
              remote: remoteTask,
              reason: 'Local version is newer'
            });
          } else {
            // Remote version wins
            const index = merged.findIndex(t => t.id === localTask.id);
            if (index !== -1) {
              merged[index] = {
                ...remoteTask,
                id: localTask.id // Keep original ID
              };
            }
          }
        }
      }
    });

    return { merged, conflicts };
  }

  // Utility methods
  private formatPriority(priority: string): string {
    const stars = {
      'Highest': '⭐⭐⭐⭐⭐',
      'High': '⭐⭐⭐⭐',
      'Medium-High': '⭐⭐⭐',
      'Medium': '⭐⭐',
      'Low': '⭐'
    };
    return stars[priority as keyof typeof stars] || '⭐';
  }

  private parsePriority(value: any): string {
    if (typeof value === 'string') {
      const starCount = (value.match(/⭐/g) || []).length;
      switch (starCount) {
        case 5: return 'Highest';
        case 4: return 'High';
        case 3: return 'Medium-High';
        case 2: return 'Medium';
        default: return 'Low';
      }
    }
    return value || 'Low';
  }

  private parseDate(value: any): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
      return value.split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  }

  private parseScore(value: any): number {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : Math.round(num * 10);
  }

  private parseNumber(value: any, min: number, max: number): number {
    const num = parseInt(value);
    if (isNaN(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  private parseStatus(value: any): string {
    if (value === true || value === 'TRUE' || value === 'true' || value === 'completed') {
      return 'completed';
    }
    return 'pending';
  }

  private createTaskKey(task: Task): string {
    return `${task.date}-${task.activity.toLowerCase().trim()}`;
  }

  private hasTaskChanges(task1: Task, task2: Task): boolean {
    return (
      task1.notes !== task2.notes ||
      task1.urgency !== task2.urgency ||
      task1.impact !== task2.impact ||
      task1.effort !== task2.effort ||
      task1.status !== task2.status ||
      task1.prerequisites !== task2.prerequisites
    );
  }
}

// Factory function for creating GoogleSheetsAPI instance
export function createGoogleSheetsAPI(credentials?: Partial<GoogleSheetsCredentials>): GoogleSheetsAPI {
  const defaultCredentials: GoogleSheetsCredentials = {
    apiKey: process.env.GOOGLE_SHEETS_API_KEY || '',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    accessToken: process.env.GOOGLE_ACCESS_TOKEN,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN
  };

  const finalCredentials = { ...defaultCredentials, ...credentials };

  if (!finalCredentials.apiKey || !finalCredentials.clientId || !finalCredentials.clientSecret) {
    throw new Error('Missing required Google API credentials. Please check your environment variables.');
  }

  return new GoogleSheetsAPI(finalCredentials);
}