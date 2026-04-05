import { AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { apiRequest, getCsrfToken } from "./queryClient";

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId?: string;
  sheetName?: string;
  authTokens?: GoogleAuthTokens;
}

export interface SyncResult {
  success: boolean;
  tasksUpdated: number;
  tasksCreated: number;
  conflicts: number;
  errors: string[];
  lastSyncTime: string;
}

export class GoogleSheetsClient {
  private config: GoogleSheetsConfig;

  constructor(config: GoogleSheetsConfig = {}) {
    this.config = config;
  }

  // Check if API credentials are configured
  async checkCredentials(): Promise<{ configured: boolean; message: string }> {
    try {
      const response = await fetch('/api/google-sheets/auth-url');
      if (response.ok) {
        return { configured: true, message: 'Google API credentials are configured' };
      } else {
        const error = await response.json();
        return { 
          configured: false, 
          message: error.message || 'Google API credentials not configured' 
        };
      }
    } catch (error: any) {
      return { configured: false, message: 'Unable to verify Google API credentials' };
    }
  }

  // Generate authentication URL
  async getAuthUrl(): Promise<string> {
    const response = await fetch('/api/google-sheets/auth-url');
    const data = await response.json();
    return data.authUrl;
  }

  private postHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const csrf = getCsrfToken();
    if (csrf) h[AXTASK_CSRF_HEADER] = csrf;
    return h;
  }

  async authenticateWithCode(code: string): Promise<GoogleAuthTokens> {
    const response = await fetch('/api/google-sheets/auth-callback', {
      method: 'POST',
      headers: this.postHeaders(),
      body: JSON.stringify({ code })
    });
    const data = await response.json();
    
    return {
      accessToken: data.tokens.accessToken,
      refreshToken: data.tokens.refreshToken
    };
  }

  // Get spreadsheet information (POST so tokens are not in the URL)
  async getSpreadsheetInfo(spreadsheetId: string, tokens: GoogleAuthTokens) {
    const response = await fetch(`/api/google-sheets/spreadsheet/${spreadsheetId}`, {
      method: "POST",
      headers: this.postHeaders(),
      body: JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const ct = response.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const j = await response.json();
          detail = typeof j?.message === "string" ? j.message : JSON.stringify(j);
        } else {
          detail = (await response.text()).slice(0, 500);
        }
      } catch {
        detail = response.statusText;
      }
      throw new Error(
        `getSpreadsheetInfo failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
      );
    }
    return await response.json();
  }

  // Create new task spreadsheet
  async createSpreadsheet(title: string, tokens: GoogleAuthTokens): Promise<{ spreadsheetId: string; url: string }> {
    const response = await fetch('/api/google-sheets/create-spreadsheet', {
      method: 'POST',
      headers: this.postHeaders(),
      body: JSON.stringify({
        title,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      })
    });
    const data = await response.json();
    
    return {
      spreadsheetId: data.spreadsheetId,
      url: data.url
    };
  }

  // Export tasks to Google Sheets
  async exportTasks(
    spreadsheetId: string, 
    tokens: GoogleAuthTokens, 
    sheetName = 'Tasks'
  ): Promise<SyncResult> {
    const response = await fetch('/api/google-sheets/export', {
      method: 'POST',
      headers: this.postHeaders(),
      body: JSON.stringify({
        spreadsheetId,
        sheetName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      })
    });
    
    return await response.json();
  }

  // Import tasks from Google Sheets
  async importTasks(
    spreadsheetId: string, 
    tokens: GoogleAuthTokens, 
    sheetName = 'Tasks'
  ): Promise<{ imported: number; total: number; message: string }> {
    const response = await fetch('/api/google-sheets/import', {
      method: 'POST',
      headers: this.postHeaders(),
      body: JSON.stringify({
        spreadsheetId,
        sheetName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      })
    });
    
    return await response.json();
  }

  // Sync tasks bidirectionally
  async syncTasks(
    spreadsheetId: string, 
    tokens: GoogleAuthTokens, 
    sheetName = 'Tasks'
  ): Promise<{ 
    message: string; 
    exported: SyncResult; 
    conflicts: number; 
    conflictDetails: any[] 
  }> {
    const response = await fetch('/api/google-sheets/sync', {
      method: 'POST',
      headers: this.postHeaders(),
      body: JSON.stringify({
        spreadsheetId,
        sheetName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      })
    });
    
    return await response.json();
  }

  // Update configuration
  updateConfig(newConfig: Partial<GoogleSheetsConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  // Get current configuration
  getConfig(): GoogleSheetsConfig {
    return { ...this.config };
  }
}

// Utility functions for OAuth flow
export const googleAuthUtils = {
  // Extract authorization code from URL (for OAuth callback)
  extractCodeFromUrl: (url: string): string | null => {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('code');
  },

  // Store tokens securely in localStorage (for demo purposes)
  storeTokens: (tokens: GoogleAuthTokens): void => {
    localStorage.setItem('google_auth_tokens', JSON.stringify(tokens));
  },

  // Retrieve stored tokens
  getStoredTokens: (): GoogleAuthTokens | null => {
    const stored = localStorage.getItem("google_auth_tokens");
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as GoogleAuthTokens).accessToken === "string" &&
        typeof (parsed as GoogleAuthTokens).refreshToken === "string"
      ) {
        return parsed as GoogleAuthTokens;
      }
      localStorage.removeItem("google_auth_tokens");
      return null;
    } catch {
      console.warn("[google-api] Removing corrupt google_auth_tokens from localStorage");
      localStorage.removeItem("google_auth_tokens");
      return null;
    }
  },

  // Clear stored tokens
  clearTokens: (): void => {
    localStorage.removeItem('google_auth_tokens');
  },

  // Check if tokens are valid (basic check)
  areTokensValid: (tokens: GoogleAuthTokens | null): boolean => {
    return !!(tokens?.accessToken && tokens?.refreshToken);
  }
};

// Export default instance
export const googleSheetsClient = new GoogleSheetsClient();