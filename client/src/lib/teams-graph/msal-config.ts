/**
 * MSAL.js configuration for the Teams deployment-chat sweep.
 *
 * This is a delegated (user) OAuth flow with PKCE. It runs entirely in the
 * browser — no tenant admin consent is required because `Chat.ReadBasic`
 * is a user-consentable scope for work/school accounts.
 *
 * The app registration is created by the end user (see
 * docs/TEAMS_GRAPH_APP_REGISTRATION.md). We never ship secrets; the client
 * id and tenant/authority are plain Vite env vars.
 *
 * Required env (prefixed VITE_ so Vite exposes them to the SPA):
 *   VITE_TEAMS_GRAPH_CLIENT_ID  — Entra ID application (client) id
 *   VITE_TEAMS_GRAPH_AUTHORITY  — one of:
 *       "https://login.microsoftonline.com/organizations"   (multi-tenant, work/school)
 *       "https://login.microsoftonline.com/<tenant-guid>"   (single-tenant)
 *       "https://login.microsoftonline.com/common"          (any MS account)
 *     Defaults to "organizations" which fits the multi-tenant
 *     work/school app registration we document.
 *   VITE_TEAMS_GRAPH_REDIRECT_URI — redirect URI registered in Azure
 *     (defaults to `${window.location.origin}/billing-bridge`).
 */
import {
  PublicClientApplication,
  type Configuration,
} from "@azure/msal-browser";

export interface TeamsGraphConfig {
  clientId: string;
  authority: string;
  redirectUri: string;
}

export function readTeamsGraphConfig(): TeamsGraphConfig | null {
  const clientId = import.meta.env.VITE_TEAMS_GRAPH_CLIENT_ID as string | undefined;
  if (!clientId) return null;
  const authority =
    (import.meta.env.VITE_TEAMS_GRAPH_AUTHORITY as string | undefined)
    ?? "https://login.microsoftonline.com/organizations";
  const redirectUri =
    (import.meta.env.VITE_TEAMS_GRAPH_REDIRECT_URI as string | undefined)
    ?? `${window.location.origin}/billing-bridge`;
  return { clientId, authority, redirectUri };
}

/** Least-privileged delegated scope for listing chats + members. */
export const TEAMS_GRAPH_SCOPES = ["Chat.ReadBasic", "offline_access"];

let _msal: PublicClientApplication | null = null;
let _initPromise: Promise<void> | null = null;

export function getMsalInstance(cfg: TeamsGraphConfig): PublicClientApplication {
  if (_msal) return _msal;
  const msalConfig: Configuration = {
    auth: {
      clientId: cfg.clientId,
      authority: cfg.authority,
      redirectUri: cfg.redirectUri,
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  };
  _msal = new PublicClientApplication(msalConfig);
  return _msal;
}

export async function ensureMsalInitialized(
  instance: PublicClientApplication,
): Promise<void> {
  if (!_initPromise) {
    _initPromise = instance.initialize();
  }
  await _initPromise;
}
