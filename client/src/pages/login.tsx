import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecureInput } from "@/components/ui/secure-input";
import { Label } from "@/components/ui/label";
import {
  CheckSquare, Loader2, ShieldCheck, ShieldAlert,
  Eye, EyeOff, User, Clock, X, KeyRound, HelpCircle, ShieldQuestion,
} from "lucide-react";

// ── Local-storage helpers for "remembered accounts" ─────────────────────────
const ACCOUNTS_KEY = "axtask_known_accounts";
const LAST_KEY = "axtask_last_email";

interface KnownAccount {
  email: string;
  displayName: string;
  provider: "google" | "workos" | "replit" | "local";
  lastUsed: number; // epoch ms
}

function getKnownAccounts(): KnownAccount[] {
  try {
    const raw: any[] = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    // Migrate legacy entries that lack a provider field
    return raw.map((a) => ({ ...a, provider: a.provider || "local" }));
  } catch { return []; }
}

function rememberAccount(email: string, displayName: string, provider: KnownAccount["provider"] = "local") {
  const accounts = getKnownAccounts().filter((a) => a.email !== email);
  accounts.unshift({ email, displayName, provider, lastUsed: Date.now() });
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
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
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
  const [providers, setProviders] = useState<{ name: string; loginUrl: string }[]>([]);

  // Forgot-password flow state
  type ForgotStep = "email" | "method" | "security" | "reset" | "done";
  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [resetToken, setResetToken] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasSecurityQ, setHasSecurityQ] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [knownAccounts, setKnownAccounts] = useState<KnownAccount[]>([]);
  const lastEmail = getLastEmail();

  // Check URL for OAuth error params or reset tokens
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      const messages: Record<string, string> = {
        missing_code: "Authentication failed — no authorization code received.",
        session_failed: "Authentication succeeded but session creation failed.",
        auth_failed: "Authentication failed. Please try again.",
        google_not_configured: "Google sign-in is not available. Please use another sign-in method.",
        workos_not_configured: "WorkOS sign-in is not available. Please use another sign-in method.",
        replit_not_configured: "Replit sign-in is not available. Please use another sign-in method.",
      };
      setError(messages[oauthError] || `Authentication error: ${oauthError}`);
      window.history.replaceState({}, "", "/");
    }
    // If we arrived via a password-reset email link
    const token = params.get("reset_token");
    if (token) {
      setMode("forgot");
      setForgotStep("reset");
      setResetToken(token);
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
        if (d.providers) setProviders(d.providers);
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

  const providerLoginUrls: Record<string, string> = {
    google: "/api/auth/google/login",
    replit: "/api/auth/replit/login",
    workos: "/api/auth/workos/login",
  };

  const handlePickAccount = useCallback((acct: KnownAccount) => {
    const url = providerLoginUrls[acct.provider];
    if (url) {
      window.location.href = url;
      return;
    }
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

  // ── Forgot-password handlers ───────────────────────────────────────────
  const handleForgotSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setHasSecurityQ(!!data.hasSecurityQuestion);

      // In dev mode, the server returns the token directly
      if (data._devToken) {
        setResetToken(data._devToken);
        setForgotStep("reset");
      } else if (data.hasSecurityQuestion) {
        setForgotStep("method");
      } else {
        setSuccessMessage("Check your email for a password reset link.");
        setForgotStep("done");
      }
    } catch (err: any) {
      setError(err.message || "Failed to request reset");
    } finally { setSubmitting(false); }
  };

  const handleFetchSecurityQuestion = async () => {
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/auth/security-question", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSecurityQuestion(data.question);
      setForgotStep("security");
    } catch (err: any) {
      setError(err.message || "No security question available");
    } finally { setSubmitting(false); }
  };

  const handleVerifySecurityAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-security-answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, answer: securityAnswer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResetToken(data.token);
      setForgotStep("reset");
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally { setSubmitting(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      return setError("Passwords do not match");
    }
    if (newPassword.length < 8) {
      return setError("Password must be at least 8 characters");
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccessMessage("Password reset successfully! You can now sign in.");
      setForgotStep("done");
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally { setSubmitting(false); }
  };

  const resetForgotFlow = () => {
    setMode("login");
    setForgotStep("email");
    setResetToken("");
    setSecurityAnswer("");
    setNewPassword("");
    setConfirmPassword("");
    setSecurityQuestion("");
    setSuccessMessage("");
    setError("");
  };

  const newPasswordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

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
            {mode === "forgot"
              ? forgotStep === "done" ? "Success" : "Reset your password"
              : mode === "login"
                ? !showForm && knownAccounts.length > 0
                  ? "Choose an account"
                  : showForm ? "Sign in to your account" : "Sign in"
                : "Create your account"}
          </h2>

          {/* ── Unified account picker (all providers) ───────────────────── */}
          {mode === "login" && !showForm && knownAccounts.length > 0 && (
            <div className="space-y-2">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              )}

              {knownAccounts.map((acct) => (
                <div
                  key={acct.email}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePickAccount(acct)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handlePickAccount(acct); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left group cursor-pointer"
                >
                  {/* Provider icon */}
                  {acct.provider === "google" ? (
                    <div className="h-10 w-10 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0">
                      <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    </div>
                  ) : acct.provider === "workos" ? (
                    <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  ) : acct.provider === "replit" ? (
                    <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 flex items-center justify-center shrink-0">
                      <KeyRound className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                  ) : (
                    <Avatar name={acct.displayName || acct.email} />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {acct.displayName || acct.email.split("@")[0]}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                      {acct.email}
                      <span className="text-[10px] text-gray-400">
                        · {acct.provider === "google" ? "Google" : acct.provider === "workos" ? "WorkOS" : acct.provider === "replit" ? "Replit" : "Password"}
                      </span>
                    </div>
                  </div>

                  {acct.email === lastEmail && (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                      <Clock className="h-2.5 w-2.5" /> Last used
                    </span>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveAccount(e, acct.email); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity shrink-0"
                    title="Forget this account"
                  >
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </div>
              ))}

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or</span></div>
              </div>

              {/* Quick-add buttons for other sign-in methods */}
              <div className="flex flex-wrap gap-2">
                <a href="/api/auth/google/login"
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-600 dark:text-gray-300">
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </a>
                <a href="/api/auth/replit/login"
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-600 dark:text-gray-300">
                  <KeyRound className="h-4 w-4" />
                  Replit
                </a>
                <a href="/api/auth/workos/login"
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-600 dark:text-gray-300">
                  <ShieldCheck className="h-4 w-4" />
                  WorkOS
                </a>
                <button
                  onClick={() => { setShowForm(true); setEmail(""); setError(""); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-500 dark:text-gray-400"
                >
                  <User className="h-4 w-4" />
                  Password
                </button>
              </div>
            </div>
          )}

          {/* ── Sign-in options (no known accounts, no form yet) ────── */}
          {mode === "login" && !showForm && knownAccounts.length === 0 && (
            <div className="space-y-3">
              {/* 1. Google */}
              <a
                href="/api/auth/google/login"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors font-medium text-gray-700 dark:text-gray-200"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </a>

              {/* 2. Replit */}
              <a
                href="/api/auth/replit/login"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors font-medium text-gray-700 dark:text-gray-200"
              >
                <KeyRound className="h-5 w-5" />
                Sign in with Replit
              </a>

              {/* 3. WorkOS */}
              <a
                href="/api/auth/workos/login"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors font-medium text-gray-700 dark:text-gray-200"
              >
                <ShieldCheck className="h-5 w-5" />
                Continue with WorkOS
              </a>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              )}

              {/* 4. Email & password */}
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

          {/* ── Email / password form ────────────────────────────────────── */}
          {mode !== "forgot" && (showForm || mode === "register") && (
            <>
              {mode === "login" && (
                <div className="space-y-2 mb-4">
                  <a href="/api/auth/google/login"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                    <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Continue with Google
                  </a>
                  <a href="/api/auth/replit/login"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                    <KeyRound className="h-4 w-4" />
                    Sign in with Replit
                  </a>
                  <a href="/api/auth/workos/login"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                    <ShieldCheck className="h-4 w-4" />
                    Continue with WorkOS
                  </a>
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or use email & password</span></div>
                  </div>
                </div>
              )}
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

              {mode === "login" && (
                <button type="button"
                  onClick={() => { setMode("forgot"); setForgotStep("email"); setError(""); }}
                  className="w-full text-center text-xs text-gray-400 hover:text-primary transition-colors">
                  Forgot your password?
                </button>
              )}

              {/* Back to account picker */}
              {mode === "login" && knownAccounts.length > 0 && (
                <button type="button"
                  onClick={() => { setShowForm(false); setError(""); setPassword(""); }}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary">
                  ← Back to account list
                </button>
              )}
            </form>
            </>
          )}

          {/* ── Forgot-password flow ──────────────────────────────────── */}
          {mode === "forgot" && (
            <div className="space-y-4">
              {/* Step: Enter email */}
              {forgotStep === "email" && (
                <form onSubmit={handleForgotSubmitEmail} className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Enter the email address associated with your account.
                  </p>
                  <div>
                    <Label htmlFor="forgotEmail">Email</Label>
                    <Input id="forgotEmail" type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com" className="mt-1" />
                  </div>
                  {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <KeyRound className="mr-2 h-4 w-4" /> Continue
                  </Button>
                </form>
              )}

              {/* Step: Choose method (email sent + security question available) */}
              {forgotStep === "method" && (
                <div className="space-y-3">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">
                    ✉️ A reset link has been sent to your email.
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Don't have access to your email? Try your security question instead:
                  </p>
                  <Button variant="outline" className="w-full" onClick={handleFetchSecurityQuestion} disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <ShieldQuestion className="mr-2 h-4 w-4" /> Answer security question
                  </Button>
                  {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>}
                </div>
              )}

              {/* Step: Security question */}
              {forgotStep === "security" && (
                <form onSubmit={handleVerifySecurityAnswer} className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" /> Security Question
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">{securityQuestion}</p>
                  </div>
                  <div>
                    <Label htmlFor="secAnswer">Your Answer</Label>
                    <Input id="secAnswer" type="text" required value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      placeholder="Type your answer…" className="mt-1" />
                  </div>
                  {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify
                  </Button>
                </form>
              )}

              {/* Step: Set new password */}
              {forgotStep === "reset" && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Enter your new password below.
                  </p>
                  <div>
                    <Label htmlFor="newPw">New Password</Label>
                    <Input id="newPw" type="password" required minLength={8} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 chars, A-z, 0-9, !@#" className="mt-1" />
                    {newPassword.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full ${newPasswordStrength.color} transition-all duration-300 rounded-full`}
                            style={{ width: `${newPasswordStrength.pct}%` }} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          {newPasswordStrength.pct === 100 ? <ShieldCheck className="h-3 w-3 text-green-500" /> : <ShieldAlert className="h-3 w-3 text-yellow-500" />}
                          {newPasswordStrength.label}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="confirmPw">Confirm Password</Label>
                    <Input id="confirmPw" type="password" required value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password" className="mt-1" />
                  </div>
                  {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reset password
                  </Button>
                </form>
              )}

              {/* Step: Done */}
              {forgotStep === "done" && (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm text-green-700 dark:text-green-300 text-center">
                    ✅ {successMessage}
                  </div>
                  <Button className="w-full" onClick={resetForgotFlow}>
                    Back to sign in
                  </Button>
                </div>
              )}

              {/* Back to login (always available except done) */}
              {forgotStep !== "done" && (
                <button type="button" onClick={resetForgotFlow}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary">
                  ← Back to sign in
                </button>
              )}
            </div>
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
            ) : mode === "register" ? (
              <>
                Already have an account?{" "}
                <button onClick={() => { setMode("login"); setError(""); }}
                  className="text-primary hover:underline font-medium">
                  Sign in
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

