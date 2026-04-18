/**
 * Teams deployment-chat sweep UI.
 *
 * Browser-only Microsoft Graph sweep that produces a snapshot the Billing
 * Bridge reconcile endpoint can join against roster attendance. See
 * `docs/TEAMS_GRAPH_APP_REGISTRATION.md` for the Azure AD app-registration
 * steps the user must complete once.
 *
 * Design notes:
 *   - No tenant admin consent: we only request `Chat.ReadBasic` (delegated).
 *   - Cancellation: AbortController + "Cancel sweep" button.
 *   - Privacy: bearer tokens never leave `@azure/msal-browser` state; snapshot
 *     posted to server strips IDs/emails by default and only includes what
 *     the reconciler needs.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Download, Loader2, LogIn, LogOut, StopCircle, Zap } from "lucide-react";
import {
  ensureMsalInitialized,
  getMsalInstance,
  readTeamsGraphConfig,
  TEAMS_GRAPH_SCOPES,
} from "@/lib/teams-graph/msal-config";
import {
  buildSnapshot,
  runSweep,
  type SweepFilters,
  type SweepProgress,
  type SweepResult,
  type TeamsSweepSnapshot,
} from "@/lib/teams-graph/sweep";
import type {
  AccountInfo,
  AuthenticationResult,
  PublicClientApplication,
} from "@azure/msal-browser";

type LoginState =
  | { kind: "not_configured" }
  | { kind: "signed_out" }
  | { kind: "signing_in" }
  | { kind: "signed_in"; account: AccountInfo }
  | { kind: "error"; message: string };

export interface TeamsSweepCardProps {
  /** Called with the snapshot once a sweep completes (for Billing Bridge). */
  onSnapshot: (snapshot: TeamsSweepSnapshot | null) => void;
  /** Show a banner when a snapshot is currently loaded on the parent. */
  activeSnapshot: TeamsSweepSnapshot | null;
}

function defaultMonthBounds(): { start: string; end: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function TeamsSweepCard({ onSnapshot, activeSnapshot }: TeamsSweepCardProps) {
  const cfg = useMemo(() => readTeamsGraphConfig(), []);
  const [login, setLogin] = useState<LoginState>(
    cfg ? { kind: "signed_out" } : { kind: "not_configured" },
  );
  const msalRef = useRef<PublicClientApplication | null>(null);

  const initialBounds = useMemo(defaultMonthBounds, []);
  const [dateFrom, setDateFrom] = useState(initialBounds.start);
  const [dateTo, setDateTo] = useState(initialBounds.end);
  const [weekendOnly, setWeekendOnly] = useState(false);
  const [allowlist, setAllowlist] = useState("");
  const [denylist, setDenylist] = useState("");

  const [progress, setProgress] = useState<SweepProgress | null>(null);
  const [result, setResult] = useState<SweepResult | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ensureMsal = useCallback(async (): Promise<PublicClientApplication | null> => {
    if (!cfg) return null;
    if (!msalRef.current) {
      msalRef.current = getMsalInstance(cfg);
    }
    await ensureMsalInitialized(msalRef.current);
    return msalRef.current;
  }, [cfg]);

  const handleSignIn = useCallback(async () => {
    const msal = await ensureMsal();
    if (!msal) return;
    setLogin({ kind: "signing_in" });
    try {
      const res: AuthenticationResult = await msal.loginPopup({
        scopes: TEAMS_GRAPH_SCOPES,
        prompt: "select_account",
      });
      if (!res.account) throw new Error("Login returned no account");
      msal.setActiveAccount(res.account);
      setLogin({ kind: "signed_in", account: res.account });
    } catch (err) {
      setLogin({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [ensureMsal]);

  const handleSignOut = useCallback(async () => {
    const msal = msalRef.current;
    if (!msal) {
      setLogin({ kind: "signed_out" });
      return;
    }
    try {
      await msal.logoutPopup();
    } catch { /* ignore */ }
    setLogin({ kind: "signed_out" });
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const msal = await ensureMsal();
    if (!msal) throw new Error("MSAL not configured");
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
    if (!account) throw new Error("No active account — sign in first.");
    try {
      const res = await msal.acquireTokenSilent({
        scopes: TEAMS_GRAPH_SCOPES,
        account,
      });
      return res.accessToken;
    } catch {
      const res = await msal.acquireTokenPopup({
        scopes: TEAMS_GRAPH_SCOPES,
        account,
      });
      return res.accessToken;
    }
  }, [ensureMsal]);

  const filters = useMemo<SweepFilters>(() => {
    const f: SweepFilters = {};
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    if (weekendOnly) f.weekendOnly = true;
    if (allowlist.trim()) {
      try { f.topicAllowlistRegex = new RegExp(allowlist.trim(), "i"); } catch { /* ignore invalid regex */ }
    }
    if (denylist.trim()) {
      try { f.topicDenylistRegex = new RegExp(denylist.trim(), "i"); } catch { /* ignore invalid regex */ }
    }
    return f;
  }, [dateFrom, dateTo, weekendOnly, allowlist, denylist]);

  const handleStartSweep = useCallback(async () => {
    setSweepError(null);
    setResult(null);
    onSnapshot(null);
    setIsSweeping(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await runSweep({
        getAccessToken,
        filters,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setResult(r);
      const snap = buildSnapshot(r, filters);
      onSnapshot(snap);
    } catch (err) {
      setSweepError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSweeping(false);
      abortRef.current = null;
    }
  }, [filters, getAccessToken, onSnapshot]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDownloadSnapshot = useCallback(() => {
    if (!result) return;
    const snap = buildSnapshot(result, filters);
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teams-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, filters]);

  const progressPct = useMemo(() => {
    if (!progress) return 0;
    // We don't know the total until we finish, so show a heuristic bar
    // that ramps on matched chats.
    if (progress.phase === "done") return 100;
    const denom = Math.max(progress.totalSeen, 20);
    return Math.min(95, Math.round((progress.matched / denom) * 100));
  }, [progress]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Teams deployment-chat sweep
        </CardTitle>
        <CardDescription>
          Sign in to Microsoft (delegated, <code>Chat.ReadBasic</code>) and walk
          your dated group chats (e.g. <code>NSUH - 4/11/2026</code>). Produces
          a person-date presence snapshot you can pair with roster attendance
          to catch missed weekend hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Config banner */}
        {login.kind === "not_configured" && (
          <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
              <div>
                <strong>Not configured.</strong> Set <code>VITE_TEAMS_GRAPH_CLIENT_ID</code>{" "}
                (and optionally <code>VITE_TEAMS_GRAPH_AUTHORITY</code>,{" "}
                <code>VITE_TEAMS_GRAPH_REDIRECT_URI</code>) before restarting
                the dev server. See
                <code className="ml-1">docs/TEAMS_GRAPH_APP_REGISTRATION.md</code>.
              </div>
            </div>
          </div>
        )}

        {/* Auth controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {login.kind === "signed_in" ? (
            <>
              <Badge variant="secondary" className="text-xs">
                Signed in as {login.account.username}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="mr-1 h-4 w-4" /> Sign out
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSignIn()}
              disabled={login.kind === "signing_in" || login.kind === "not_configured"}
            >
              {login.kind === "signing_in" ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Signing in…</>
              ) : (
                <><LogIn className="mr-1 h-4 w-4" />Sign in with Microsoft</>
              )}
            </Button>
          )}
          {login.kind === "error" && (
            <span className="text-xs text-red-500">{login.message}</span>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Date from</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date to</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Topic allowlist (regex)</Label>
            <Input
              value={allowlist}
              onChange={e => setAllowlist(e.target.value)}
              placeholder="e.g. ^NSUH"
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Topic denylist (regex)</Label>
            <Input
              value={denylist}
              onChange={e => setDenylist(e.target.value)}
              placeholder="e.g. test|sandbox"
              className="text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="weekendOnly"
            checked={weekendOnly}
            onCheckedChange={(v) => setWeekendOnly(!!v)}
          />
          <label htmlFor="weekendOnly" className="text-sm">
            Weekend only (Saturday / Sunday)
          </label>
        </div>

        {/* Run controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="button"
            onClick={() => void handleStartSweep()}
            disabled={login.kind !== "signed_in" || isSweeping}
          >
            {isSweeping ? (
              <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Sweeping…</>
            ) : (
              <><Zap className="mr-1 h-4 w-4" />Run sweep</>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={!isSweeping}
          >
            <StopCircle className="mr-1 h-4 w-4" />Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadSnapshot}
            disabled={!result || result.chats.length === 0}
          >
            <Download className="mr-1 h-4 w-4" />Download snapshot JSON
          </Button>
          {sweepError && <span className="text-xs text-red-500">{sweepError}</span>}
        </div>

        {/* Progress */}
        {progress && (
          <div className="space-y-2">
            <Progress value={progressPct} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
              <div>Seen: <strong>{progress.totalSeen}</strong></div>
              <div>Matched: <strong>{progress.matched}</strong></div>
              <div>Errors: <strong>{progress.errors}</strong></div>
              <div>Phase: <strong>{progress.phase}</strong></div>
            </div>
            {progress.currentChatTopic && (
              <div className="text-xs text-muted-foreground truncate">
                Current: {progress.currentChatTopic}
              </div>
            )}
          </div>
        )}

        {/* Result summary */}
        {result && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">
                Matched chats: {result.chats.length}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Total presence rows: {result.chats.reduce((acc, c) => acc + c.members.length, 0)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Rejected topics: {result.rejected_topics.length}
              </Badge>
            </div>
            {result.chats.length > 0 && (
              <div className="max-h-48 overflow-auto text-xs">
                <ul className="space-y-1">
                  {result.chats.slice(0, 50).map(c => (
                    <li key={c.chat_id} className="truncate">
                      <span className="font-mono">{c.work_date}</span>{" "}
                      <span className="text-muted-foreground">{c.topic}</span>{" "}
                      <span>({c.members.length} members{c.error ? " — error" : ""})</span>
                    </li>
                  ))}
                  {result.chats.length > 50 && (
                    <li className="text-muted-foreground">
                      …and {result.chats.length - 50} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            {result.diagnostics.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Diagnostics ({result.diagnostics.length})
                </summary>
                <ul className="mt-1 space-y-0.5 font-mono">
                  {result.diagnostics.slice(0, 100).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {activeSnapshot && (
          <div className="text-xs text-muted-foreground">
            Snapshot loaded: {activeSnapshot.rows.length} presence rows ready to
            include on the next Run Reconciliation.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
