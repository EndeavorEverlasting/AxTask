# Security technical reference (contributors & auditors)

> **Disclosure and policy** live in **[`SECURITY.md`](./SECURITY.md)** — use that file for vulnerability reports and supported versions.
>
> **Public Git note:** This document includes implementation detail, example snippets, and deployment guidance. Anything in the default branch of a public repository is **world-readable** (including the **Raw** URL). It is **not** a secret channel. Maintainers who want less reconnaissance surface should **delete** this file from the public default branch and keep equivalent material in a **private** wiki or runbook.

---

# Security architecture & best practices (archived layout)

**Version:** 1.0.0  
**Last Updated:** April 2026  
**Status:** Contributor reference (not the public disclosure policy)

## Overview

This document outlines security considerations, vulnerabilities, and best practices for the AxTask / priority-engine codebase. It is aimed at developers, security auditors, and operators **with repository access**. It does **not** replace coordinated disclosure; see `SECURITY.md`.

## Current Security Architecture

### Authentication & Authorization

#### OAuth 2.0 Implementation
- **Google OAuth Flow**: User-specific authentication with limited scopes
- **Token Management**: Refresh tokens stored securely for offline access
- **Scope Limitations**: 
  - `https://www.googleapis.com/auth/spreadsheets` (read/write sheets)
  - `https://www.googleapis.com/auth/drive.metadata.readonly` (file metadata only)

#### Session Management
- **Storage**: PostgreSQL-backed sessions (not in-memory)
- **Lifecycle**: Automatic expiration and cleanup
- **Security**: Session tokens not exposed to client-side JavaScript

#### Step-up MFA (OTP)
- **Channels**: Email (Resend) and SMS (Twilio) for production; console logging in development.
- **Purposes**: Billing, invoicing, and phone verification use scoped challenge purposes; see [`docs/OTP_DELIVERY.md`](./OTP_DELIVERY.md).
- **Sign-up verification (planned)**: Optional email/SMS OTP **when creating a new account** to limit spam and automated signups; see [`docs/MFA_SIGNUP_VERIFICATION.md`](./MFA_SIGNUP_VERIFICATION.md). This is **not** a mandate for existing users to use MFA on every login — they keep normal sign-in unless they hit a flow that already requires step-up MFA.

### API Security

#### Input Validation
```typescript
// Double validation pattern (client + server)
const TaskSchema = z.object({
  activity: z.string().min(1).max(500),
  urgency: z.number().min(1).max(5),
  impact: z.number().min(1).max(5),
  effort: z.number().min(1).max(5)
});
```

#### Rate Limiting
- **Google Sheets API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 attempts per 15 minutes per IP
- **General API**: Standard rate limiting applied

#### SQL Injection Prevention
- **ORM Protection**: Drizzle ORM with parameterized queries
- **No Raw SQL**: All database interactions through type-safe ORM
- **Input Sanitization**: Zod schema validation before database operations

## Security Vulnerabilities & Mitigations

### Dependency Supply Chain Policy (Axios Prohibition)

#### Risk Level: HIGH
**Policy**: `axios` is prohibited in this codebase and must not be introduced or invoked.

**Required Action**:
- Use native `fetch` (Node.js/Browser) for outbound HTTP requests.
- Reject pull requests that add `axios` to dependencies or callsites.
- Treat any attempted `axios` introduction as a security review trigger.

**Verification**:
```bash
# Must return no results in app source files
rg -n "axios|from 'axios'|from \"axios\"" client server shared
```

### Environment Variable Exposure

#### Risk Level: MEDIUM
**Description**: API keys and secrets stored in environment variables could be accessible through various attack vectors.

**Current Mitigation**:
- Environment variables separate from codebase
- No hardcoded secrets in source code
- `.env`, `.env.docker`, and `.env.render` are in `.gitignore` (local only)
- `*.secrets.md` is gitignored for private runbooks
- Committed templates (`.env.example`, `.env.render.example`) contain **placeholders only**
- `render.yaml` uses `sync: false` for sensitive keys so real values are **not** stored in the repo — set them in the Render dashboard or secret store

**Additional Recommendations**:
```bash
# Production secrets belong in the host (Render env, Replit Secrets, etc.) — not in git
GOOGLE_CLIENT_ID=<set in dashboard only>
GOOGLE_CLIENT_SECRET=<set in dashboard only>
DATABASE_URL=<set in dashboard only>

# Non-sensitive defaults can live in committed examples / Blueprint non-secret keys
PORT=5000
NODE_ENV=production
```

### Repository access and deployment configuration

**Documentation does not enforce behavior.** It reduces mistakes; **access control and automation** stop bad commits.

| Goal | Practical control |
|------|-------------------|
| Stop people pushing secrets | **Branch protection** on `main`: required PR reviews, block force-push, optional **secret scanning** (GitHub/GitLab). |
| Control who edits deploy config | **`CODEOWNERS`**: require owner review for `render.yaml`, `.github/`, `docker-compose.yml`, `Dockerfile`, auth-related `server/` paths. |
| Stop Render dashboard tampering | **Render**: least-privilege team members; **do not** share one owner account; use **environment groups** and audit who has Production access. |
| Catch accidents before merge | Optional **pre-commit** hook (`git-secrets`, `detect-secrets`, or `gitleaks`) locally; **CI** job that fails if `DATABASE_URL=postgresql://` patterns appear in diff. |
| Clarify policy for contributors | In PR template: “No production URLs, credentials, or Render env values in commits.” |

**What “secretive enough” means for this repo**: templates stay generic; real values live in **Render / Neon / OAuth consoles** and in **gitignored** `.env.render` on your machine. That is the right split — it is **not** obscurity; it is **separation**. Anyone who can still open a PR can propose bad changes; **review + branch rules** are what actually prevent merge.

**Enhanced Security**:
- Implement secret rotation schedules
- Use different API keys for development vs production
- Monitor secret access patterns

### Cross-Site Scripting (XSS)

#### Risk Level: LOW-MEDIUM
**Description**: User input displayed without proper sanitization could lead to script injection.

**Current Mitigation**:
- React's built-in XSS protection (JSX escaping)
- Input validation through Zod schemas
- No `dangerouslySetInnerHTML` usage

**Vulnerable Areas**:
- Task activity names and notes
- CSV import data processing
- Search result display

**Additional Protection**:
```typescript
// Content Security Policy headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
  next();
});
```

### Cross-Site Request Forgery (CSRF)

#### Risk Level: MEDIUM
**Description**: Unauthorized requests could be made on behalf of authenticated users.

**Current Mitigation**:
- CORS configuration restricts origins
- Session-based authentication
- No state-changing GET requests

**Recommended Enhancement** (maintained alternatives — the `csurf` package is archived):

Use a **double-submit cookie** pattern or your framework’s built-in CSRF middleware:

1. On session/login, set a **non-HttpOnly** cookie holding a random CSRF token (e.g. `csrf_token`), with `Secure` and `SameSite` appropriate for your deployment (`SameSite=Lax` or `Strict` is typical; `Secure` in production).
2. Client JavaScript reads that cookie and sends the same value in a header on state-changing requests (e.g. `X-CSRF-Token` or `X-XSRF-Token`).
3. Server compares the header to the cookie value; reject if missing or mismatched.

This avoids synchronizer tokens stored only server-side for SPAs that need to read the token from the cookie. Prefer framework-native CSRF support when available (e.g. middleware that issues and validates tokens per session).

### Data Exposure Through Import/Export

#### Risk Level: MEDIUM-HIGH
**Description**: Sensitive data could be exposed through CSV exports or malicious imports.

**Current Mitigation**:
- Client-side file processing (no server storage)
- Input validation on all imported data
- User authentication required for all operations

**Enhanced Security Measures**:
```typescript
// File upload restrictions
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'];

// Content scanning for suspicious patterns
function scanFileContent(content: string): boolean {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i
  ];
  
  return !suspiciousPatterns.some(pattern => pattern.test(content));
}
```

### Database Security

#### Risk Level: LOW
**Description**: Database compromise could expose all user data.

**Current Mitigation**:
- Parameterized queries via Drizzle ORM
- No raw SQL execution
- Connection pooling with proper cleanup
- Input validation before database operations

**Database Hardening Recommendations**:
```sql
-- Row-level security (future enhancement)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_tasks_policy ON tasks
  FOR ALL TO application_user
  USING (user_id = current_user_id());

-- Audit logging
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(50),
  operation VARCHAR(10),
  old_values JSONB,
  new_values JSONB,
  user_id VARCHAR,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

## API Security Implementation

### Google Sheets API Security

#### API Key Restrictions
```javascript
// Recommended API key restrictions in Google Cloud Console:
// 1. API restrictions: Only Google Sheets API + Google Drive API
// 2. Application restrictions: HTTP referrers (websites)
//    - https://your-domain.com/*
//    - https://*.replit.app/* (for development)
// 3. IP restrictions (if applicable): Your server IPs only
```

#### OAuth Security Flow
```typescript
// Secure OAuth configuration
const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: `${process.env.BASE_URL}/api/auth/google/callback`
});

// State parameter for CSRF protection
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: REQUIRED_SCOPES,
  state: generateSecureRandomString(), // Anti-CSRF
  prompt: 'consent' // Force consent screen
});
```

### Rate Limiting Implementation

#### Production-Ready Rate Limiting
```typescript
// Enhanced rate limiting with Redis (future)
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

export const createRateLimit = (options: {
  windowMs: number;
  max: number;
  message: string;
}) => rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:'
  }),
  ...options,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});
```

## Security Headers & Middleware

### Essential Security Headers
```typescript
// Security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prefer Content-Security-Policy and correct encoding over legacy X-XSS-Protection (deprecated in browsers)
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'"
  );
  
  // HTTPS enforcement
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});
```

Use the **`Content-Security-Policy`** header as the primary modern XSS mitigation: configure `default-src` and especially `script-src` to match your real script and asset origins (avoid broad `'unsafe-inline'` for scripts when you can). Combine CSP with server-side output encoding, strict input validation, and other framework-specific XSS defenses. Do not rely on the deprecated `X-XSS-Protection` header.

### CORS Configuration
```typescript
// Secure CORS setup
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com']
    : ['http://localhost:3000', 'https://*.replit.app'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};

app.use(cors(corsOptions));
```

## Data Protection & Privacy

### Sensitive Data Handling

#### Data Classification
- **Public**: Task activity names (if user chooses to share)
- **Internal**: Task metadata, priorities, classifications
- **Confidential**: User authentication tokens, session data
- **Restricted**: API keys, database credentials

#### Data Retention Policy
```typescript
// Automatic data cleanup (recommended)
const cleanupOldData = async () => {
  // Delete tasks older than 2 years
  await db.delete(tasks)
    .where(lt(tasks.createdAt, new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)));
  
  // Clean expired sessions
  await db.delete(sessions)
    .where(lt(sessions.expires, new Date()));
};

// Run daily cleanup
schedule.scheduleJob('0 2 * * *', cleanupOldData);
```

### Encryption in Transit and at Rest

#### HTTPS Enforcement
- All production traffic over HTTPS
- HTTP Strict Transport Security (HSTS) headers
- Secure cookie flags for session management

#### Database Encryption
```sql
-- PostgreSQL encryption recommendations
-- 1. Enable SSL connections
-- 2. Use encrypted storage volumes
-- 3. Consider column-level encryption for sensitive fields

-- Example: Encrypted notes field
ALTER TABLE tasks ADD COLUMN notes_encrypted BYTEA;

-- Application-level encryption for sensitive data
```

## Incident Response & Monitoring

### Security Monitoring

#### Logging Requirements
```typescript
// Security event logging
const securityLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'security.log' })
  ]
});

// Log security events
function logSecurityEvent(event: string, details: any, req: Request) {
  securityLogger.info({
    event,
    details,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
}
```

#### Security Alerts
- Failed authentication attempts (>5 in 15 minutes)
- Unusual API usage patterns
- Large file uploads or exports
- Database connection failures
- Repeated 4xx/5xx errors from same IP

### Incident Response Plan

#### Security Breach Response
1. **Immediate Actions**:
   - Identify and contain the breach
   - Preserve evidence and logs
   - Notify relevant stakeholders

2. **Assessment**:
   - Determine scope and impact
   - Identify compromised data/systems
   - Document timeline and actions

3. **Recovery**:
   - Implement fixes and patches
   - Reset compromised credentials
   - Monitor for continued threats

4. **Post-Incident**:
   - Conduct security review
   - Update security procedures
   - Implement preventive measures

## Security Testing & Auditing

### Regular Security Assessments

#### Automated Security Scanning
```json
{
  "scripts": {
    "security:audit": "npm audit --audit-level moderate",
    "security:deps": "snyk test",
    "security:code": "semgrep --config=auto ."
  }
}
```

#### Manual Security Testing
- Input validation testing
- Authentication bypass attempts
- SQL injection testing
- XSS vulnerability assessment
- File upload security testing

### Compliance Considerations

#### Data Protection Requirements
- **GDPR**: Right to deletion, data portability, consent management
- **CCPA**: Data disclosure, opt-out mechanisms
- **SOC 2**: Security controls and monitoring

#### Audit Trail Requirements
```typescript
// Comprehensive audit logging
interface AuditEvent {
  action: string;
  resource: string;
  userId?: string;
  ip: string;
  timestamp: Date;
  success: boolean;
  details?: any;
}

function auditLog(event: AuditEvent) {
  // Log to secure, tamper-evident storage
  // Include cryptographic integrity verification
}
```

## Deployment Security

### Production Security Checklist

#### Environment Security
- [ ] All secrets stored in Replit Secrets (secure UI) — do not commit secrets to files/repo; Replit exposes them to the app as environment variables at runtime
- [ ] Different API keys for production vs development
- [ ] Database credentials rotated and secured
- [ ] HTTPS enforced with valid certificates
- [ ] Security headers implemented
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Error handling doesn't expose sensitive information

#### Application Security
- [ ] Input validation on all endpoints
- [ ] SQL injection protection verified
- [ ] XSS protection implemented
- [ ] CSRF protection enabled
- [ ] File upload restrictions in place
- [ ] Proper session management
- [ ] Security logging configured

#### Infrastructure Security
- [ ] Database access restricted to application only
- [ ] Backup encryption enabled
- [ ] Network security properly configured
- [ ] Monitoring and alerting in place
- [ ] Regular security updates scheduled

## Future Security Enhancements

### Planned Improvements
1. **MFA**: Sign-up verification (OTP) for **new** accounts to reduce abuse; optional future **login** 2FA for users who want it — without forcing existing users through MFA on every sign-in (step-up MFA for sensitive actions remains separate)
2. **API Versioning**: Implement API versioning for secure updates
3. **Advanced Threat Detection**: ML-based anomaly detection
4. **Zero-Trust Architecture**: Implement principle of least privilege
5. **End-to-End Encryption**: Client-side encryption for sensitive data

### Security Roadmap
- **Phase 1**: CSRF protection and enhanced rate limiting
- **Phase 2**: Comprehensive audit logging and monitoring
- **Phase 3**: Advanced authentication and authorization hardening
- **Phase 4**: Security compliance assessment and control verification

---

**Last security review (technical reference):** April 2026  

**Reporting vulnerabilities:** use **[`SECURITY.md`](./SECURITY.md)** — not this file.

This technical reference should be reviewed periodically and updated when architecture or controls change.
