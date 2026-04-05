# Google Sheets API Setup Guide

## Overview

This guide provides step-by-step instructions for setting up Google Sheets API integration with AxTask. The setup enables real-time synchronization between your intelligent task management system and Google Sheets.

## Security Notice

⚠️ **Critical Security Requirements**

- **API keys are sensitive credentials** - treat them like passwords
- **Never share API keys** in public repositories, emails, or screenshots
- **Use separate projects** for different environments (development/production)
- **Rotate keys regularly** (every 90 days recommended)
- **Limit key permissions** to only required APIs
- **Implement rate limiting** to prevent API abuse
- **Use HTTPS only** in production environments
- **Monitor API usage** for unusual patterns
- **Enable audit logging** for security compliance

## Multi-User Configuration

### Option 1: Individual User Setup (Recommended)
Each user sets up their own Google Cloud project and API keys:
- **Pros**: Full control, isolated permissions, secure
- **Cons**: Each user must complete setup process

### Option 2: Shared Service Account (Advanced)
Single service account with shared access:
- **Pros**: One-time setup, centralized management
- **Cons**: Requires advanced Google Workspace configuration
- **Use case**: Organizations with Google Workspace admin access

### Option 3: Hybrid Approach
Team lead sets up shared project, distributes credentials securely:
- **Pros**: Balanced security and convenience
- **Cons**: Requires secure credential distribution

## Step-by-Step Setup Instructions

### Step 1: Create Google Cloud Project

1. **Navigate to Google Cloud Console**
   - Go to: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create New Project**
   - Click "Select a project" dropdown (top left)
   - Click "New Project"
   - Enter project name: `Priority-Engine-Tasks` (or your preference)
   - Select organization if applicable
   - Click "Create"

3. **Select Your Project**
   - Wait for project creation (30-60 seconds)
   - Ensure your new project is selected in the dropdown

### Step 2: Enable Required APIs

1. **Navigate to APIs & Services**
   - In the left sidebar, click "APIs & Services" → "Library"
   - Or go directly to: https://console.cloud.google.com/apis/library

2. **Enable Google Sheets API**
   - Search for "Google Sheets API"
   - Click on "Google Sheets API" result
   - Click "Enable" button
   - Wait for activation (usually instant)

3. **Enable Google Drive API** (Required for file access)
   - Search for "Google Drive API"
   - Click on "Google Drive API" result
   - Click "Enable" button

### Step 3: Create API Key

1. **Navigate to Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Or: https://console.cloud.google.com/apis/credentials

2. **Create API Key**
   - Click "+ Create Credentials" → "API key"
   - Copy the generated API key immediately
   - Click "Close" (don't restrict yet)

3. **Restrict API Key (Security)**
   - Find your new API key in the list
   - Click the pencil icon (Edit)
   - Under "API restrictions":
     - Select "Restrict key"
     - Check: "Google Sheets API"
     - Check: "Google Drive API"
   - Under "Application restrictions":
     - Select "HTTP referrers (web sites)"
     - Add your domain(s):
       - `https://your-app-domain.com/*`
       - `https://*.replit.app/*` (for Replit deployment)
       - `http://localhost:*` (for development only)
   - **Additional Security Measures**:
     - Set quota limits (recommended: 100 requests/minute)
     - Enable usage monitoring and alerts
     - Consider IP restrictions for production keys
   - Click "Save"

**Your API Key**: `AIza...` (copy this for GOOGLE_SHEETS_API_KEY)

### Step 4: Create OAuth 2.0 Credentials

1. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" (unless using Google Workspace)
   - Fill required fields:
     - App name: "AxTask"
     - User support email: your email
     - Developer contact: your email
   - Click "Save and Continue"
   - Skip "Scopes" and "Test users" for now
   - Review and submit

2. **Create OAuth Client ID**
   - Go to "APIs & Services" → "Credentials"
   - Click "+ Create Credentials" → "OAuth client ID"
   
   **⚠️ Important Setup Notes:**
   
   You're in the right place—this screen is **Create OAuth client ID**.
   The fields you're looking for (Origins + Redirect URIs) appear **after you pick "Web application."**

   **Step-by-step configuration:**

   1. **Application type:** choose **Web application**
   2. **Name:** e.g., `AxTask Web Client` or `AxTask Dev (Replit)`
   3. Two sections will appear with "**ADD URI**" buttons:

      **Authorized JavaScript origins** → click **ADD URI** and enter:
      - `https://<your-repl-subdomain>.replit.dev`
      - *(optional local)* `http://localhost:5000` (for development)

      **Authorized redirect URIs** → click **ADD URI** and enter:
      - `https://<your-repl-subdomain>.replit.dev/auth/callback`
      - *(optional local)* `http://localhost:5000/auth/callback` (for development)

   4. Click **Create** → copy the **Client ID** and **Client Secret**

   **🔍 How to Find Your Replit Subdomain:**
   - Open your Replit workspace
   - Click the "Run" button or open the preview
   - Look at the URL in the preview window: `https://your-project-name--username.replit.dev`
   - Your subdomain is: `your-project-name--username`
   - Use this in the OAuth configuration above

   **💡 Troubleshooting:**
   - If you don't see the "ADD URI" areas after choosing **Web application**, try scrolling down - on some displays they appear below the fold
   - Share your exact Replit preview URL for a copy-paste block filled in with your real domain

3. **Copy Credentials**
   - **Client ID**: `123456789-abc...` (copy for GOOGLE_CLIENT_ID)
   - **Client Secret**: `GOCSPX-...` (copy for GOOGLE_CLIENT_SECRET)

## Environment Configuration

### Development Setup

Create a `.env` file in your project root:

```env
# Google Sheets API Configuration
GOOGLE_SHEETS_API_KEY=AIza...your-api-key...
GOOGLE_CLIENT_ID=123456789-abc...your-client-id...
GOOGLE_CLIENT_SECRET=GOCSPX-...your-client-secret...

# Optional: Default spreadsheet settings
GOOGLE_SHEETS_DEFAULT_FOLDER_ID=your-folder-id
GOOGLE_SHEETS_TEMPLATE_ID=your-template-spreadsheet-id
```

### Production Deployment

⚠️ **Never commit API keys to version control**

For Replit deployment:
1. Go to your Repl settings
2. Navigate to "Secrets" tab
3. Add each environment variable:

```
GOOGLE_CLIENT_ID=...from console...
GOOGLE_CLIENT_SECRET=...from console...
GOOGLE_REDIRECT_URI=https://<your-repl-subdomain>.replit.dev/auth/callback
GOOGLE_SCOPES=https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file
SESSION_SECRET=...random string...
```

**Example with actual Replit domain:**
If your preview URL is `https://axtask--johndoe.replit.dev`, then use:
```
GOOGLE_REDIRECT_URI=https://axtask--johndoe.replit.dev/auth/callback
```

**Additional Security Configuration:**
- Rate limiting is automatically applied (100 requests/15 minutes for Sheets API)
- Authentication endpoints are limited to 5 attempts/15 minutes
- Security headers are enforced in production
- All traffic uses HTTPS with HSTS headers

## Testing Your Setup

### Quick Verification

1. **Test API Key**
   ```bash
   curl "https://sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/values/Class%20Data!A2:E?key=YOUR_API_KEY"
   ```
   Should return sample data (not an error)

2. **Create Test Spreadsheet**
   - Go to Google Sheets: https://sheets.google.com
   - Create new spreadsheet: "Priority Engine Test"
   - Share with "Anyone with the link can edit"
   - Copy the spreadsheet ID from URL

3. **Test in Application**
   - Start your application
   - Navigate to Google Sheets sync page
   - Enter your test spreadsheet ID
   - Try syncing a few tasks

## Common Issues & Solutions

### "API key not valid" Error
- **Check restrictions**: Ensure your domain is in authorized referrers
- **Verify APIs**: Confirm Google Sheets API is enabled
- **Key format**: API key should start with `AIza`

### "OAuth client not found" Error
- **Check client ID**: Ensure it matches your OAuth configuration
- **Verify domain**: Confirm authorized origins include your domain
- **Client secret**: Verify it's entered correctly (starts with `GOCSPX-`)

### "Insufficient permissions" Error
- **Sheet sharing**: Ensure spreadsheet is shared with edit permissions
- **OAuth scopes**: May need to add specific scopes in consent screen
- **API quotas**: Check if you've exceeded usage limits

### Rate Limiting
- **Quota exceeded**: Google Sheets API has usage limits
- **Solution**: Implement exponential backoff in sync operations
- **Monitor usage**: Check API console for quota usage

## Security Best Practices

### For Individual Users
1. **Use unique project names** to avoid conflicts
2. **Enable 2FA** on your Google account
3. **Review project permissions** regularly
4. **Delete unused projects** to reduce attack surface

### For Team Deployments
1. **Service account approach**:
   - Create service account in Google Cloud
   - Download JSON key file
   - Share spreadsheets with service account email
   - Store JSON securely (not in code)

2. **Key rotation schedule**:
   - API keys: Every 90 days
   - OAuth credentials: Every 180 days
   - Service account keys: Every 365 days

3. **Access monitoring**:
   - Enable audit logs in Google Cloud
   - Monitor API usage patterns
   - Set up alerts for unusual activity

## Advanced Configuration

### Custom OAuth Scopes
For enhanced functionality, add these scopes in OAuth consent screen:

```
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
```

### Webhook Integration
For real-time updates from Google Sheets to your app:

1. **Enable Google Apps Script API**
2. **Create webhook endpoint** in your application
3. **Set up trigger** in Google Apps Script
4. **Configure authentication** for webhook calls

### Batch Operations
For large datasets, implement batch operations:

```javascript
// Example: Batch read multiple ranges
const ranges = ['Sheet1!A1:Z100', 'Sheet2!A1:Z100'];
const response = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: 'your-sheet-id',
  ranges: ranges,
});
```

## Security Monitoring & Compliance

### Required Security Practices
- **Monitor API usage**: Check Google Cloud Console regularly for unusual patterns
- **Set up alerts**: Configure notifications for quota exceeded or suspicious activity
- **Regular audits**: Review API key usage monthly
- **Incident response**: Have a plan for compromised credentials

### Security Compliance Checklist
- [ ] API keys stored in Replit Secrets (not environment variables)
- [ ] Different keys for development vs production
- [ ] API restrictions properly configured
- [ ] Rate limiting enabled and tested
- [ ] HTTPS enforced in production
- [ ] Regular security reviews scheduled
- [ ] Backup authentication method available

## Spreadsheet layout and embedded automation (roadmap)

AxTask can evolve beyond the current **single header row + data from row 2** layout (`createTaskSpreadsheet` / `exportTasks` in `server/google-sheets-api.ts`). For the **top-fixed entry zone** (always work at the top while history grows downward) and **embedding dates, task IDs, and validation** so users do not rely on separate Apps Script projects, see **[SPREADSHEET_TEMPLATE_UX.md](./SPREADSHEET_TEMPLATE_UX.md)**.

## Support Resources

- **Google Sheets API Documentation**: https://developers.google.com/sheets/api
- **Google Cloud Console**: https://console.cloud.google.com
- **OAuth 2.0 Guide**: https://developers.google.com/identity/protocols/oauth2
- **API Quotas and Limits**: https://developers.google.com/sheets/api/limits
- **Security:** See `docs/SECURITY.md` for disclosure policy; detailed engineering notes in `docs/SECURITY_TECHNICAL_REFERENCE.md`.

## Contact & Support

For application-specific issues:
- Check application logs for detailed error messages
- Verify environment variables are set correctly
- Test with a simple spreadsheet first

For Google API issues:
- Consult Google's official documentation
- Check Google Cloud Console for quota/billing issues
- Use Google's support channels for platform problems

---

**Last Updated**: July 30, 2025
**Version**: 1.0.0

This setup enables secure, real-time synchronization between your Priority Engine and Google Sheets while maintaining proper security practices for multi-user environments.