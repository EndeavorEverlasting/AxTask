
import { config } from 'dotenv';

config();

export interface GoogleSheetsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  apiKey: string;
}

// Pre-configured settings to reduce user setup steps
export const GOOGLE_SHEETS_CONFIG: GoogleSheetsConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev` : 'http://localhost:5000'}/api/google-sheets/auth-callback`,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
  ],
  apiKey: process.env.GOOGLE_SHEETS_API_KEY || ''
};

// Helper to check if configuration is complete
export function isGoogleSheetsConfigured(): boolean {
  return !!(
    GOOGLE_SHEETS_CONFIG.clientId &&
    GOOGLE_SHEETS_CONFIG.clientSecret &&
    GOOGLE_SHEETS_CONFIG.apiKey
  );
}

// Helper to get missing configuration items
export function getMissingConfig(): string[] {
  const missing: string[] = [];
  
  if (!GOOGLE_SHEETS_CONFIG.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!GOOGLE_SHEETS_CONFIG.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!GOOGLE_SHEETS_CONFIG.apiKey) missing.push('GOOGLE_SHEETS_API_KEY');
  
  return missing;
}

// Auto-detect environment and provide helpful messages
export function getConfigurationGuide(): {
  isConfigured: boolean;
  environment: 'replit' | 'local';
  redirectUri: string;
  missingSecrets: string[];
  setupInstructions: string;
} {
  const isReplit = !!(process.env.REPL_SLUG && process.env.REPL_OWNER);
  const environment = isReplit ? 'replit' : 'local';
  const missingSecrets = getMissingConfig();
  
  let setupInstructions = '';
  
  if (missingSecrets.length > 0) {
    if (isReplit) {
      setupInstructions = `Please add these secrets in the Replit Secrets tab:\n${missingSecrets.map(s => `  - ${s}`).join('\n')}`;
    } else {
      setupInstructions = `Please add these to your .env file:\n${missingSecrets.map(s => `  - ${s}=your_value_here`).join('\n')}`;
    }
  }
  
  return {
    isConfigured: isGoogleSheetsConfigured(),
    environment,
    redirectUri: GOOGLE_SHEETS_CONFIG.redirectUri,
    missingSecrets,
    setupInstructions
  };
}
