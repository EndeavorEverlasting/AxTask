# Teams deployment-chat sweep — Microsoft Graph app registration

This guide sets up the **browser-only** Microsoft Graph integration used by
`client/src/components/billing/TeamsSweepCard.tsx` and the reconciliation
extensions in `server/services/corporate-extractors/reconcile.ts`.

The goal is a **least-privileged, user-consent-only** OAuth flow:

- Runs in your normal browser — no desktop Teams app, no E3 on the workstation.
- Uses `Chat.ReadBasic` (user-consentable — **no tenant admin consent**).
- Works with any work/school (Entra ID) account you already sign into Teams
  on the web with.

The AxTask server never sees your Microsoft access token. The browser calls
Graph directly and only sends the **normalized presence snapshot** to
`/api/billing-bridge/reconcile`.

---

## What you need once (per tenant)

You (the signed-in user) need permission to **register an application** in your
Microsoft Entra ID tenant. Most tenants allow standard users to register apps
by default. If yours is locked down, ask IT to flip the tenant setting
**“Users can register applications”** back on, or to register this app on
your behalf.

You do **not** need:

- Global admin or Application admin roles.
- Admin consent for any API permission.
- Any tenant-wide change.

---

## Step-by-step Azure portal setup (multi-tenant work/school)

Open <https://entra.microsoft.com> → **Applications → App registrations → New registration**.

1. **Name:** `AxTask Teams Sweep` (any label you like).
2. **Supported account types:** choose
   **“Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)”**.
   This matches the `https://login.microsoftonline.com/organizations`
   authority used in `readTeamsGraphConfig()`.
3. **Redirect URI:**
   - Platform: **Single-page application (SPA)**.
   - URI: one of
     - `http://localhost:5173/billing-bridge` (Vite dev default)
     - `https://your.ax.task.host/billing-bridge` (deployed)
   - You can add multiple SPA redirect URIs; the one you use at runtime must
     match `VITE_TEAMS_GRAPH_REDIRECT_URI` exactly (or the default of
     `${window.location.origin}/billing-bridge`).
4. Click **Register**.
5. On the app **Overview** page, copy the **Application (client) ID**.
6. Go to **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions** and add:
   - `Chat.ReadBasic`
   - `offline_access`
7. **Do NOT click “Grant admin consent”** — leave status as **“Not granted
   for {tenant}”**. User consent is enough for `Chat.ReadBasic`.
8. Go to **Authentication** and verify:
   - The SPA redirect URI is listed.
   - **Allow public client flows** is **off** (SPA + PKCE only).
   - **Implicit grant and hybrid flows** — leave both checkboxes off (we use
     auth code + PKCE).

That’s it on the Azure side.

---

## AxTask env vars

Add to your `.env` (or `.env.local` for dev):

```ini
# Entra ID application (client) id from step 5
VITE_TEAMS_GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000

# Optional — override if not multi-tenant, e.g. single-tenant:
#   https://login.microsoftonline.com/<tenant-guid>
# Default:
#   https://login.microsoftonline.com/organizations
VITE_TEAMS_GRAPH_AUTHORITY=https://login.microsoftonline.com/organizations

# Optional — defaults to `${window.location.origin}/billing-bridge`
VITE_TEAMS_GRAPH_REDIRECT_URI=http://localhost:5173/billing-bridge
```

Restart the dev server (`npm run dev`) so Vite picks up the env.

---

## First-time consent

1. Open the Billing Bridge page in AxTask.
2. In the **Teams deployment-chat sweep** card, click **Sign in with Microsoft**.
3. Pick your work/school account.
4. Microsoft shows a consent screen listing:
   - **Read names and members of your chats** (`Chat.ReadBasic`)
   - **Maintain access to data you have given it access to** (`offline_access`)
5. Accept. You land back in AxTask, signed in.

Subsequent runs refresh silently in the browser via MSAL; no UI prompt unless
you sign out or the refresh token expires.

---

## Running a sweep

1. Sign in.
2. Set the **Date from / Date to** window (e.g. the weekend range leadership
   flagged).
3. (Optional) Add a topic **allowlist** regex (`^NSUH`) to exclude unrelated
   chats, or a **denylist** regex (`test|sandbox`).
4. (Optional) Check **Weekend only**.
5. Click **Run sweep**.
6. The card shows live progress (chats seen, matched, errors). Click **Cancel**
   to stop mid-run — the sweep cooperatively aborts, and the partial result
   is discarded.
7. When finished:
   - The snapshot is automatically staged for the next **Run Reconciliation**.
   - Click **Download snapshot JSON** to save it for forensic review or to
     feed a future native tool.

---

## What ends up in the snapshot

Example (abbreviated):

```json
{
  "generated_at": "2026-04-18T14:00:00.000Z",
  "topic_pattern": "MDY-or-ISO",
  "tool_version": "browser-sweep-0.1.0",
  "filters": {
    "date_from": "2026-04-01",
    "date_to": "2026-04-30",
    "weekend_only": true
  },
  "rows": [
    {
      "work_date": "2026-04-11",
      "display_name": "Alejandro Perez",
      "chat_topic": "NSUH - 4/11/2026",
      "chat_id": "19:abc@thread.v2"
    }
  ]
}
```

The server runs `normalizeTeamsSnapshot()` on ingestion to map each
`display_name` through `tools/billing_bridge/config/person_aliases.csv` →
canonical roster name (same logic as `canonicalizePerson`).

---

## New exception types produced

`server/services/corporate-extractors/reconcile.ts` emits two new types when
a snapshot is present:

| `exception_type` | Meaning |
|------------------|---------|
| `teams_presence_no_attendance` | Canonical person was a member of a dated deployment chat but has **no roster attendance hours** for that date. |
| `teams_presence_no_task_evidence` | (strict mode only) Canonical person was a member of a dated deployment chat but has **no Daily Narrative / Event Log evidence**. Opt in via the **Strict** checkbox. |

These ride the same `reconciliation.exceptions` array as existing rules and
render in the **Exceptions** tab with badges **Teams vs Roster** /
**Teams No Evidence**.

---

## Privacy & logging

- No Microsoft tokens or raw Graph payloads are sent to the AxTask server or
  logged in HTTP access logs (see `docs/CLIENT_VISIBLE_PRIVACY.md`).
- Only the normalized snapshot crosses the wire; the server returns counts
  and the list of unmapped display names, not PII-rich member records.
- The browser stores MSAL cache in `sessionStorage` — it clears on tab close.

---

## Troubleshooting

- **“AADSTS50011: reply URL”** — your redirect URI in the Azure app doesn’t
  match `VITE_TEAMS_GRAPH_REDIRECT_URI`. Either fix the env var or add the
  URI in the Azure portal.
- **“Need admin approval”** on sign-in — your tenant admin disabled user
  consent. Ask them to enable user consent for this app, or grant consent to
  `Chat.ReadBasic` and `offline_access` for your account.
- **No chats returned** — confirm you are the **signed-in user on the web
  Teams** that owns/participates in the deployment chats, and your date
  window matches the topic dates.
- **Unmapped display names** in the reconciliation result — add rows to
  `tools/billing_bridge/config/person_aliases.csv` and re-run.

---

## Later: native (C# / Rust) tool

The plan in
[`c:\Users\Cheex\.cursor\plans\teams_deployment_sweep_ae43584d.plan.md`](../c:\Users\Cheex\.cursor\plans\teams_deployment_sweep_ae43584d.plan.md)
describes an optional local sweep tool for permitted workstations. It will
produce the **same snapshot JSON shape** and feed the same
`/api/billing-bridge/reconcile` route, so the Azure app registration above
is the only prerequisite.
