import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecureInput } from "@/components/ui/secure-input";
import { Label } from "@/components/ui/label";
import {
  CheckSquare, Loader2, ShieldCheck, ShieldAlert,
  Eye, EyeOff, User, Clock, X,
} from "lucide-react";

// ── Local-storage helpers for "remembered accounts" ─────────────────────────
const ACCOUNTS_KEY = "axtask_known_accounts";
const LAST_KEY = "axtask_last_email";

interface KnownAccount {
  email: string;
  displayName: string;
  lastUsed: number; // epoch ms
}

function getKnownAccounts(): KnownAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); }
  catch { return []; }
}

function rememberAccount(email: string, displayName: string) {
  const accounts = getKnownAccounts().filter((a) => a.email !== email);
  accounts.unshift({ email, displayName, lastUsed: Date.now() });
  // Keep at most 5 accounts
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
  localStorage.setItem(LAST_KEY, email);
}

function forgetAccount(email: string) {
  const accounts = getKnownAccounts().filter((a) => a.email !== email);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  if (localStorage.getItem(LAST_KEY) === email) {
    localStorage.setItem(LAST_KEY, accounts[0]?.email || "");
  }
}

function getLastEmail(): string {
  return localStorage.getItem(LAST_KEY) || "";
}

// ── Password strength ───────────────────────────────────────────────────────
function getPasswordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", pct: 33 };
  if (score <= 4) return { label: "Fair", color: "bg-yellow-500", pct: 66 };
  return { label: "Strong", color: "bg-green-500", pct: 100 };
}

// ── Initials avatar ─────────────────────────────────────────────────────────
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={`${dim} rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0`}>
      {initials || <User className="h-4 w-4" />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showForm, setShowForm] = useState(false); // true = manual email/pw form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [regMode, setRegMode] = useState<string>("open");
  const [authProvider, setAuthProvider] = useState<string>("local");
  const [loginUrl, setLoginUrl] = useState<string>("");

  const [knownAccounts, setKnownAccounts] = useState<KnownAccount[]>([]);
  const lastEmail = getLastEmail();

  // Check URL for OAuth error params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      const messages: Record<string, string> = {
        missing_code: "Authentication failed — no authorization code received.",
        session_failed: "Authentication succeeded but session creation failed.",
        auth_failed: "Authentication failed. Please try again.",
      };
      setError(messages[oauthError] || `Authentication error: ${oauthError}`);
      // Clean URL
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Fetch server auth config
  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => {
        setRegMode(d.registrationMode);
        setAuthProvider(d.authProvider || "local");
        setLoginUrl(d.loginUrl || "");
      })
      .catch(() => {});
  }, []);

  // Load known accounts
  useEffect(() => {
    const accts = getKnownAccounts();
    setKnownAccounts(accts);
    // If no known accounts, go straight to form
    if (accts.length === 0) setShowForm(true);
  }, []);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handlePickAccount = useCallback((acct: KnownAccount) => {
    setEmail(acct.email);
    setShowForm(true);
    setError("");
  }, []);

  const handleRemoveAccount = useCallback((e: React.MouseEvent, email: string) => {
    e.stopPropagation();
    forgetAccount(email);
    const updated = getKnownAccounts();
    setKnownAccounts(updated);
    if (updated.length === 0) setShowForm(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        // On successful login, remember this account
        // (displayName comes back from the auth context after login)
      } else {
        await register(email, password, displayName || undefined, regMode === "invite" ? inviteCode : undefined);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const canRegister = regMode !== "closed";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <CheckSquare className="h-8 w-8" />
            <span className="text-3xl font-bold">AxTask</span>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            Intelligent Task Management
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            {mode === "login"
              ? (authProvider !== "local" && !showForm)
                ? "Sign in"
                : showForm ? "Sign in to your account" : "Choose an account"
              : "Create your account"}
          </h2>

          {/* ── OAuth provider buttons (WorkOS / Google) ─────────────────── */}
          {mode === "login" && authProvider !== "local" && loginUrl && !showForm && (
            <div className="space-y-3">
              <a
                href={loginUrl}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
              >
                {authProvider === "workos" ? (
                  <>
                    <ShieldCheck className="h-5 w-5" />
                    Continue with WorkOS
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Continue with Google
                  </>
                )}
              </a>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              )}

              {/* Known accounts reminder */}
              {knownAccounts.length > 0 && (
                <div className="pt-2 space-y-2">
                  <p className="text-xs text-gray-400 text-center">Previously signed in:</p>
                  {knownAccounts.slice(0, 3).map((acct) => (
                    <div key={acct.email} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-sm">
                      <Avatar name={acct.displayName || acct.email} size="sm" />
                      <span className="truncate text-gray-600 dark:text-gray-300">{acct.email}</span>
                      {acct.email === lastEmail && (
                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">Last used</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or use email & password</span></div>
              </div>

              <button
                onClick={() => setShowForm(true)}
                className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                Sign in with email & password
              </button>
            </div>
          )}

          {/* ── Account picker (login mode, local provider, known accounts exist) ────────── */}
          {mode === "login" && authProvider === "local" && !showForm && knownAccounts.length > 0 && (
            <div className="space-y-2">
              {knownAccounts.map((acct) => (
                <button
                  key={acct.email}
                  onClick={() => handlePickAccount(acct)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left group"
                >
                  <Avatar name={acct.displayName || acct.email} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {acct.displayName || acct.email.split("@")[0]}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {acct.email}
                    </div>
                  </div>
                  {acct.email === lastEmail && (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <Clock className="h-2.5 w-2.5" /> Last used
                    </span>
                  )}
                  <button
                    onClick={(e) => handleRemoveAccount(e, acct.email)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity shrink-0"
                    title="Forget this account"
                  >
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </button>
              ))}

              <button
                onClick={() => { setShowForm(true); setEmail(""); setError(""); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-500 dark:text-gray-400"
              >
                <div className="h-10 w-10 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4" />
                </div>
                Use another account
              </button>
            </div>
          )}

          {/* ── Email / password form ────────────────────────────────────── */}
          {(showForm || mode === "register") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <Label htmlFor="displayName">Name (optional)</Label>
                  <Input id="displayName" type="text" value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name" className="mt-1" />
                </div>
              )}

              <div>
                <Label htmlFor="email">Email</Label>
                <SecureInput id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  inactivityTimeout={120}
                  onInactivityClear={() => setEmail("")}
                  placeholder="you@example.com" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1">
                  <SecureInput id="password"
                    type={showPassword ? "text" : "password"}
                    alwaysMask={!showPassword}
                    required
                    minLength={mode === "register" ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    inactivityTimeout={60}
                    onInactivityClear={() => setPassword("")}
                    placeholder={mode === "register" ? "Min 8 chars, A-z, 0-9, !@#" : "••••••••"}
                    className="pr-16" />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {mode === "register" && password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} transition-all duration-300 rounded-full`}
                        style={{ width: `${strength.pct}%` }} />
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      {strength.pct === 100
                        ? <ShieldCheck className="h-3 w-3 text-green-500" />
                        : <ShieldAlert className="h-3 w-3 text-yellow-500" />}
                      {strength.label}
                      {strength.pct < 100 && " — needs uppercase, lowercase, number & special char"}
                    </div>
                  </div>
                )}
              </div>

              {mode === "register" && regMode === "invite" && (
                <div>
                  <Label htmlFor="inviteCode">Invite Code</Label>
                  <SecureInput id="inviteCode" type="text" required value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    inactivityTimeout={30}
                    onInactivityClear={() => setInviteCode("")}
                    placeholder="Enter your invite code" className="mt-1" />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>

              {/* Back to account picker */}
              {mode === "login" && knownAccounts.length > 0 && (
                <button type="button"
                  onClick={() => { setShowForm(false); setError(""); setPassword(""); }}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary">
                  ← Back to account list
                </button>
              )}
            </form>
          )}

          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {mode === "login" ? (
              canRegister ? (
                <>
                  Don't have an account?{" "}
                  <button onClick={() => { setMode("register"); setShowForm(true); setError(""); }}
                    className="text-primary hover:underline font-medium">
                    Get started
                  </button>
                </>
              ) : null
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => { setMode("login"); setError(""); }}
                  className="text-primary hover:underline font-medium">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

