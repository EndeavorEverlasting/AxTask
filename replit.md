# AxTask — Priority Engine Task Management System

## Overview
AxTask is a full-stack intelligent task management application that automates task prioritization using an advanced scoring engine. It analyzes task content, keywords, tags, and other factors to assign priorities, reducing manual effort and enhancing task organization. The project aims to deliver a professional, secure, and highly functional task management solution with a clean user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application leverages React 18 with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for a mobile-responsive design. It incorporates advanced accessibility features such as dynamic focus glow, auto-focus for quick entry, enhanced button labels, full keyboard navigation, and UI scale control. `framer-motion` is used for animations, respecting `prefers-reduced-motion`.

### Technical Implementations
The frontend utilizes TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form handling. The backend is built with Node.js and Express.js (TypeScript, ES modules). PostgreSQL with Drizzle ORM serves as the database, and the API is RESTful with JSON responses. Both client and server-side validation are enforced with Zod schemas. Session management is handled by PostgreSQL-backed storage.

Key features include:
-   **Priority Engine**: An algorithm that considers urgency, impact, effort, keywords, tags, deadlines, and crisis detection.
-   **Calendar Views**: Interactive task management with drag-and-drop rescheduling.
-   **Import/Export System**: Bulk Excel/CSV import and export with server-side batch processing.
-   **Print Checklist & OCR**: Generates printable PDF checklists and allows OCR scanning for automated status updates.
-   **AI Planner Agent**: Provides daily briefings, recommended tasks, weekly mini-calendars, and a conversational Q&A interface.
-   **Analytics Dashboard**: Offers visual insights into task metrics.
-   **Real-time Updates**: Achieved through optimistic updates and cache invalidation.
-   **Voice Input & Universal Voice Command System**: Browser-native Web Speech API for task dictation and global voice commands (Ctrl+M) for intent classification (task creation, planner query, etc.).
-   **Immersive Mobile Voice Overlay**: Full-screen mobile voice experience with animated waveforms and branded result cards.
-   **Task Review Engine**: Voice/text-driven bulk task management with natural language parsing.
-   **Gamification (AxCoins)**: A currency and rewards system for task classification, on-time bonuses, streaks, achievements, and a Rewards Shop.
-   **Data Migration Toolkit**: Full database export/import with referential integrity validation.
-   **Task Recurrence**: Configurable recurrence schedules including custom day/date patterns.
-   **Proactive Field Glow Warnings**: Visual cues for empty required fields.
-   **Universal Glow System**: CSS glow classes for various UI feedback and tutorial purposes.
-   **Interactive Tutorial**: A guided walkthrough utilizing the universal glow system.
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket with live presence and role-based permissions.
-   **Coin Economy (Spend & Scarcity)**: Consumable coin sinks like Streak Shields, Priority Boost, Task Bounties, and Coin Gifting.
-   **Pattern Learning Engine**: RAG-style intelligence that learns from user task history to suggest topics, recurring tasks, and deadlines.
-   **Task Attachments**: Image uploads (JPEG/PNG/GIF/WebP, 5MB limit, 3 max per task) with drag-drop zone, thumbnail previews, lightbox display, and markdown content editor.
-   **Interactive Feedback System**: Micro-surveys (thumbs/radio/text types) with contextual triggers, server-side cooldown enforcement, thumbs up/down reactions on completed tasks, all tied to the AxCoin economy.
-   **NodeWeaver Integration (Scaffolded)**: Feedback classification pipeline that ingests survey responses and task reactions, classifying them as bugs, user errors, feature requests, praise, complaints, or noise. Engine at `server/engines/nodeweaver-engine.ts` with `@nodeweaver-hook` placeholders for: classification logic, enrichment, batch reprocessing, digest generation, trend detection, and resolution suggestions. DB table `feedback_classifications` stores results. API at `/api/feedback/*`. Includes a **classification dispute system** where users can challenge auto-classifications by suggesting an alternative category, other users vote agree/disagree, and AxTask tracks consensus per category pair. When enough disputes accumulate (≥5) with sufficient agreement (≥70%), the system escalates to `review_needed` status for NodeWeaver to evaluate and potentially redefine category rules. DB tables: `classification_disputes`, `classification_dispute_votes`, `category_review_triggers`.
-   **Community Forum**: Social feed where users can create posts with titles, body (markdown), and categories (Tips, Questions, Feedback, Facts, Productivity, General). Features include upvote/downvote on posts and comments, flat threaded comments, user avatars/display names, category filter tabs, sort by newest/popular, pagination, and gamification integration (5 coins for posts, 2 for comments, 1 for receiving upvotes). Admin moderation: pin/hide/delete posts and comments, report system with status tracking. DB tables: `forum_posts`, `forum_comments`, `forum_votes`, `forum_reports`. Pages: `/community` (feed), `/community/:id` (post detail). API at `/api/forum/*`.

### Authentication & Security
The system supports Google OAuth, Replit OIDC, WorkOS AuthKit (enterprise SSO), and a local email/password strategy using bcrypt. Security features include account lockout, user banning, robust password policies, input validation, security questions, hashed password reset tokens, a Security Admin UI, rate limiting, comprehensive security audit logging, request size limits, session security with httpOnly cookies, and enforced HTTPS with HSTS and CSP in production. Authentication middleware is handled by Passport.js. TOTP-based MFA (two-factor authentication) is available via authenticator apps (Google Authenticator, Authy, etc.) and is required for destructive actions in the Danger Zone (e.g., clearing all tasks). MFA secrets are encrypted at rest using AES-256-GCM.

### Authentication Troubleshooting — 403 Errors & OAuth Redirect URI Mismatches

This section documents a recurring class of auth failures that surface as 403 errors during development and preview. Agents and developers must understand these to avoid misdiagnosing code bugs when the root cause is environmental.

#### Problem Summary
Users frequently encounter 403 or `auth_failed` redirects when attempting Google OAuth login from the Replit dev preview. The login button redirects to Google, but the callback fails silently or returns a 403. This is **not a code bug** — it is an OAuth redirect URI mismatch.

#### Root Cause: Dynamic Preview URLs
- Replit dev preview URLs are dynamically generated (e.g., `https://<hash>-00-<slug>.spock.replit.dev`).
- These URLs can change on workflow restart, container reallocation, or environment rebuild.
- Google OAuth requires the **exact** redirect URI to be registered in the Google Cloud Console under **Authorized redirect URIs**.
- When the preview URL changes, the redirect URI sent during the OAuth flow (`/api/auth/google/callback`) no longer matches what Google has on file, causing Google to reject the callback with a `redirect_uri_mismatch` error that surfaces as a 403 or `auth_failed` redirect to the user.

#### How the Code Handles Redirect URIs
- File: `server/auth-providers.ts`
- The redirect URI is built dynamically using `x-forwarded-host` and `x-forwarded-proto` headers: `const origin = \`\${forwardedProto}://\${forwardedHost}\``; `const redirectUri = \`\${origin}/api/auth/google/callback\``.
- The URI is saved to the session (`req.session.oauthRedirectUri`) during `/api/auth/google/login` and retrieved during `/api/auth/google/callback` to ensure consistency within a single flow.
- **Key issue**: Even though the code correctly uses the same URI for both legs of the flow, Google still rejects it if that URI is not in the **Authorized redirect URIs** list in Google Cloud Console.

#### Resolution Steps for Development
1. **Check current preview URL**: Look at the browser address bar or the Replit preview pane URL.
2. **Add to Google Cloud Console**: Go to Google Cloud Console → APIs & Credentials → OAuth 2.0 Client → Edit → Add `https://<current-preview-url>/api/auth/google/callback` to Authorized redirect URIs.
3. **Use wildcard-friendly alternatives**: Consider adding multiple known Replit URL patterns, or use the Replit deployment URL (which is stable) for testing OAuth.
4. **Dev account fallback**: For local testing without Google OAuth, use the ephemeral dev accounts printed at server startup (e.g., `dev@axtask.local` / rotated password). These use the local email/password strategy and bypass OAuth entirely.

#### Resolution Steps for Production Deployment
1. **Use a stable domain**: The deployed app URL (e.g., `https://axtask.replit.app`) is stable and should be the primary redirect URI registered in Google Cloud Console.
2. **Register both**: Register both `https://<deploy-domain>/api/auth/google/callback` AND any custom domain callbacks.
3. **Verify environment variables**: Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in the production environment (Replit Secrets or deployment config).
4. **Session cookie settings**: In production (`NODE_ENV=production`), session cookies use `secure: true`, `sameSite: "lax"`, and `httpOnly: true`. Ensure the deployment serves over HTTPS (Replit deployments do this automatically).

#### Common Misdiagnoses to Avoid
- **"The auth code is broken"** — If Google login works in one environment but not another, it's almost certainly a redirect URI mismatch, not a code bug.
- **"The server is returning 403"** — The 403 may actually be Google rejecting the callback, which the server catches and redirects as `/?error=auth_failed`. Check server logs for `[auth] Google token exchange response:` or `[auth] Google callback error:` messages.
- **"The user is banned"** — A true ban 403 only occurs after successful OAuth when `isUserBanned()` returns true. It shows the message "This account has been suspended." and is logged as `login_banned_attempt`.
- **"Session issues"** — If `req.session.oauthRedirectUri` is lost between the login redirect and the callback (e.g., due to cookie issues or container restart), the fallback dynamically reconstructs the URI. This can cause a mismatch if the host changed between the two requests.

#### Diagnostic Checklist
When a 403 occurs during OAuth login:
1. Check server console for `[auth] Google token exchange response:` — this shows Google's error.
2. Check server console for `[auth] Redirect URI used:` — compare with Google Cloud Console.
3. Verify the preview URL hasn't changed since the redirect URIs were registered.
4. Try the dev account login (`dev@axtask.local`) to confirm the app itself is functional.
5. Check `req.session` persistence — if sessions are lost between requests, the redirect URI fallback may construct a different URI.

### System Design Choices
The application is designed for **Replit Autoscale** (Google Cloud Run), necessitating a stateless architecture. All persistent state (tasks, users, sessions, patterns, coins, collaboration data) resides in PostgreSQL, preventing reliance on in-memory state. File uploads and generated files are processed or streamed immediately without persistent disk storage. The deployment process involves `npm run build` to create `dist/index.js` (backend) and `dist/public/` (frontend), which are then containerized. Critical Autoscale constraints include a single exposed port, Cloud Run controlling the `PORT` environment variable, no persistent server memory or filesystem, and fast startup times. API routes and health checks must be registered before static file serving.

## External Dependencies

### Authentication
-   **Passport.js**: Authentication middleware.
-   **bcrypt**: Password hashing.
-   **express-session**, **connect-pg-simple**: PostgreSQL-backed sessions.
-   **express-rate-limit**: Rate limiting.
-   **helmet**: Security headers.

### Database
-   **PostgreSQL**: Replit Helium database.
-   **Drizzle ORM**: Type-safe ORM.

### Google Integration
-   **Google Sheets API**: For task import/export.
-   **googleapis**: Google API client.

### UI Libraries
-   **Radix UI**: Headless UI components.
-   **Lucide React**: Icons.
-   **Recharts**: Data visualization.
-   **date-fns**: Date manipulation.
-   **framer-motion**: Animation library.

### MFA / TOTP
-   **otpauth**: TOTP code generation and verification.
-   **qrcode**: QR code generation for MFA setup.

### File Processing
-   **Papa Parse**: CSV processing.
-   **xlsx**: Excel file processing.
-   **pdfkit**: PDF generation.
-   **multer**: File uploads.
-   **sharp**: Image thumbnail generation.
-   **Tesseract.js**: OCR engine.

### Development Utilities
-   **Vite**: Frontend build tool.
-   **esbuild**: Backend bundling.
-   **TypeScript**: Language.
-   **Tailwind CSS**: Styling framework.