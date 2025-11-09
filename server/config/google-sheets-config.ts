
export interface GoogleSheetsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  apiKey: string;
}

// Platform-agnostic configuration - works on any hosting platform
export const GOOGLE_SHEETS_CONFIG: GoogleSheetsConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // Redirect URI must be explicitly set in production
  // Falls back to localhost for local development only
  redirectUri: process.env.GOOGLE_REDIRECT_URI || process.env.BASE_URL 
    ? `${process.env.BASE_URL}/api/google-sheets/auth-callback`
    : 'http://0.0.0.0:5000/api/google-sheets/auth-callback',
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

// Platform-agnostic configuration guidance
export function getConfigurationGuide(): {
  isConfigured: boolean;
  environment: 'production' | 'development';
  redirectUri: string;
  missingSecrets: string[];
  setupInstructions: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const environment = isProduction ? 'production' : 'development';
  const missingSecrets = getMissingConfig();
  
  let setupInstructions = '';
  
  if (missingSecrets.length > 0) {
    setupInstructions = `Please configure these environment variables:\n${missingSecrets.map(s => `  - ${s}=your_value_here`).join('\n')}\n\nFor production: Set these in your hosting platform's environment configuration.\nFor development: Add these to your .env file.`;
  }
  
  return {
    isConfigured: isGoogleSheetsConfigured(),
    environment,
    redirectUri: GOOGLE_SHEETS_CONFIG.redirectUri,
    missingSecrets,
    setupInstructions
  };
}
