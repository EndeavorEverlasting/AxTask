// Google Sheets synchronization utilities
// Works with standard CSV export/import workflow - no API keys required

export interface GoogleSheetsConfig {
  sheetName: string;
  lastSyncTime: string;
  autoSyncEnabled: boolean;
  syncInterval: number; // minutes
}

export interface SyncStatus {
  isActive: boolean;
  lastSync: string | null;
  nextSync: string | null;
  pendingChanges: number;
  conflictCount: number;
}

export class GoogleSheetsSync {
  private config: GoogleSheetsConfig;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  // Generate instructions for manual sync workflow
  static generateSyncInstructions(): string {
    return `
📋 GOOGLE SHEETS SYNC WORKFLOW

**Step 1: Export from Google Sheets**
1. Open your Google Sheets task tracker
2. File → Download → Comma Separated Values (.csv)
3. Save file (typically downloads as "YourSheetName.csv")

**Step 2: Import to Task Tracker**
1. Go to Import/Export page
2. Upload the CSV file
3. Review cost estimate and proceed
4. Wait for import completion

**Step 3: Export Updated Tasks**
1. Click "Export to CSV" button
2. Download the updated file
3. Open your Google Sheets
4. File → Import → Upload → Replace data

**For Regular Sync:**
- Set a reminder to sync daily/weekly
- Use consistent file naming
- Keep both systems updated

**Conflict Resolution:**
- Task Tracker is the "source of truth" for priorities
- Google Sheets is best for quick task entry
- Import from Sheets → Process → Export back to Sheets
    `;
  }

  // Detect if a CSV file appears to be from Google Sheets
  static detectGoogleSheetsFormat(csvContent: string): boolean {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return false;
    
    const header = lines[0].toLowerCase();
    
    // Look for common Google Sheets patterns
    const googleSheetsIndicators = [
      'date,activity', // Our standard format
      'timestamp', // Google Forms integration
      'created time', // Google Sheets timestamp
      '☆', // Star ratings in content
    ];
    
    return googleSheetsIndicators.some(indicator => 
      header.includes(indicator) || csvContent.includes(indicator)
    );
  }

  // Generate CSV format optimized for Google Sheets
  static formatForGoogleSheets(tasks: any[]): string {
    const headers = [
      'Date',
      'Activity', 
      'Notes',
      'Priority (⭐)',
      'Classification',
      'Score',
      'Urgency (1-5)',
      'Impact (1-5)', 
      'Effort (1-5)',
      'Prerequisites',
      'Status',
      'Last Updated'
    ];

    const formatPriority = (priority: string): string => {
      const stars = {
        'Highest': '⭐⭐⭐⭐⭐',
        'High': '⭐⭐⭐⭐',
        'Medium-High': '⭐⭐⭐',
        'Medium': '⭐⭐',
        'Low': '⭐'
      };
      return stars[priority as keyof typeof stars] || '⭐';
    };

    const formatStatus = (status: string): string => {
      return status === 'completed' ? 'TRUE' : 'FALSE';
    };

    const csvRows = [headers.join(',')];
    
    tasks.forEach(task => {
      const row = [
        task.date,
        `"${task.activity?.replace(/"/g, '""') || ''}"`,
        `"${task.notes?.replace(/"/g, '""') || ''}"`,
        formatPriority(task.priority),
        task.classification || 'General',
        (task.priorityScore / 10).toFixed(1),
        task.urgency || '',
        task.impact || '',
        task.effort || '',
        `"${task.prerequisites?.replace(/"/g, '""') || ''}"`,
        formatStatus(task.status),
        new Date(task.updatedAt || task.createdAt).toLocaleDateString()
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Parse CSV and detect changes since last sync
  static analyzeChanges(
    currentTasks: any[],
    importedTasks: any[]
  ): {
    newTasks: any[];
    updatedTasks: any[];
    deletedTasks: any[];
    conflicts: any[];
  } {
    const currentMap = new Map(currentTasks.map(t => [t.activity.toLowerCase().trim(), t]));
    const importedMap = new Map(importedTasks.map(t => [t.activity?.toLowerCase().trim(), t]));
    
    const newTasks = importedTasks.filter(t => 
      !currentMap.has(t.activity?.toLowerCase().trim())
    );
    
    const updatedTasks: any[] = [];
    const conflicts: any[] = [];
    
    importedTasks.forEach(importedTask => {
      const key = importedTask.activity?.toLowerCase().trim();
      const currentTask = currentMap.get(key);
      
      if (currentTask) {
        // Check if task was modified
        const hasChanges = 
          currentTask.notes !== importedTask.notes ||
          currentTask.urgency !== importedTask.urgency ||
          currentTask.impact !== importedTask.impact ||
          currentTask.effort !== importedTask.effort;
          
        if (hasChanges) {
          // Check for conflicts (both sides modified)
          const currentModified = new Date(currentTask.updatedAt);
          const importModified = new Date(importedTask.date);
          
          if (currentModified > importModified) {
            conflicts.push({
              current: currentTask,
              imported: importedTask,
              reason: 'Both versions modified'
            });
          } else {
            updatedTasks.push({
              ...currentTask,
              ...importedTask,
              id: currentTask.id // Keep existing ID
            });
          }
        }
      }
    });
    
    const deletedTasks = currentTasks.filter(t => 
      !importedMap.has(t.activity.toLowerCase().trim())
    );
    
    return { newTasks, updatedTasks, deletedTasks, conflicts };
  }

  // Start automatic sync checking (checks for new files)
  startAutoSync(callback: () => void): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    this.syncTimer = setInterval(() => {
      callback();
    }, this.config.syncInterval * 60 * 1000);
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Get sync status
  getSyncStatus(): SyncStatus {
    const now = new Date();
    const lastSync = this.config.lastSyncTime ? new Date(this.config.lastSyncTime) : null;
    const nextSync = lastSync 
      ? new Date(lastSync.getTime() + this.config.syncInterval * 60 * 1000)
      : null;

    return {
      isActive: this.syncTimer !== null,
      lastSync: lastSync?.toISOString() || null,
      nextSync: nextSync?.toISOString() || null,
      pendingChanges: 0, // Would be calculated from actual data
      conflictCount: 0
    };
  }

  // Update sync configuration
  updateConfig(newConfig: Partial<GoogleSheetsConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Helper functions for Google Sheets integration
export const googleSheetsUtils = {
  // Generate a shareable link instruction
  generateShareInstructions: (sheetName: string): string => {
    return `
🔗 SHARING YOUR GOOGLE SHEET

To enable team collaboration:

1. **Open your Google Sheet**: "${sheetName}"
2. **Click "Share" button** (top right)
3. **Set permissions**:
   - Anyone with link → Viewer (for read-only access)
   - Anyone with link → Editor (for full collaboration)
4. **Copy the link** and share with team members

**For automated workflows:**
- Use Google Apps Script to trigger imports
- Set up time-based triggers for regular sync
- Connect to Google Forms for task submission

**Security tips:**
- Use "Specific people" for sensitive data
- Enable "Notify people" for change tracking
- Consider using Google Workspace for advanced permissions
    `;
  },

  // Validate CSV format for Google Sheets compatibility
  validateGoogleSheetsFormat: (csvContent: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      errors.push('File must contain at least a header and one data row');
    }
    
    const header = lines[0].toLowerCase();
    const requiredFields = ['date', 'activity'];
    
    requiredFields.forEach(field => {
      if (!header.includes(field)) {
        errors.push(`Missing required column: ${field}`);
      }
    });
    
    // Check for common Google Sheets issues
    if (csvContent.includes('\t')) {
      warnings.push('File contains tabs - ensure it\'s saved as CSV, not TSV');
    }
    
    if (lines.some(line => line.split(',').length !== lines[0].split(',').length)) {
      warnings.push('Inconsistent column count - check for unescaped commas in text');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
};