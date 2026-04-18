import { useState, useEffect, useMemo, useCallback } from "react";
import {
  SSO_NOT_CONFIGURED_USER_MESSAGES,
  isSsoNotConfiguredErrorCode,
  shouldShowSsoDownBanner,
} from "@/lib/sso-down-banner";
import { useAuth } from "@/lib/auth-context";
import { getCsrfToken } from "@/lib/queryClient";
import { AXTASK_CSRF_HEADER } from "@shared/http-auth";

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token
    ? { "Content-Type": "application/json", [AXTASK_CSRF_HEADER]: token }
    : { "Content-Type": "application/json" };
}
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { DonateCta } from "@/components/donate-cta";
import { LoginHelpOverlay } from "@/components/login-help-overlay";
import { Input } from "@/components/ui/input";
import { SecureInput } from "@/components/ui/secure-input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  CheckSquare, Loader2, ShieldCheck, ShieldAlert,
  Eye, EyeOff, User, Clock, X, KeyRound, HelpCircle, ShieldQuestion,
  ArrowRight, ToggleLeft, ToggleRight, Info,
} from "lucide-react";
import { PretextShell } from "@/components/pretext/pretext-shell";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";
import { cn } from "@/lib/utils";
import { rememberPostLoginRedirectForOAuth } from "@/lib/post-login-redirect";

function persistNextBeforeExternalAuth() {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) rememberPostLoginRedirectForOAuth(next);
  } catch {
    /* ignore */
  }
}

const ACCOUNTS_KEY = "axtask_known_accounts";
const LAST_KEY = "axtask_last_email";
const LAST_PROVIDER_KEY = "axtask_last_provider";
const REMEMBER_PREF_KEY = "axtask_remember_provider";

interface KnownAccount {
  email: string;
  displayName: string;
  provider: "google" | "workos" | "replit" | "local";
  lastUsed: number;
}

function getKnownAccounts(): KnownAccount[] {
  try {
    const raw: any[] = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    return raw.map((a) => ({ ...a, provider: a.provider || "local" }));
  } catch { return []; }
}

function rememberAccount(email: string, displayName: string, provider: KnownAccount["provider"] = "local") {
  try {
    const accounts = getKnownAccounts().filter((a) => a.email !== email);
    accounts.unshift({ email, displayName, provider, lastUsed: Date.now() });
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
    localStorage.setItem(LAST_KEY, email);
    if (getRememberPref()) {
      localStorage.setItem(LAST_PROVIDER_KEY, provider);
    }
  } catch { /* localStorage unavailable */ }
}

function forgetAccount(email: string) {
  try {
    const accounts = getKnownAccounts().filter((a) => a.email !== email);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    if (localStorage.getItem(LAST_KEY) === email) {
      localStorage.setItem(LAST_KEY, accounts[0]?.email || "");
      if (getRememberPref()) {
        if (accounts[0]) {
          localStorage.setItem(LAST_PROVIDER_KEY, accounts[0].provider);
        } else {
          localStorage.removeItem(LAST_PROVIDER_KEY);
        }
      }
    }
  } catch { /* localStorage unavailable */ }
}

function getLastEmail(): string {
  try { return localStorage.getItem(LAST_KEY) || ""; } catch { return ""; }
}

function getLastProvider(): string {
  try { return localStorage.getItem(LAST_PROVIDER_KEY) || ""; } catch { return ""; }
}

function getRememberPref(): boolean {
  try { return localStorage.getItem(REMEMBER_PREF_KEY) !== "false"; } catch { return true; }
}

function setRememberPref(val: boolean) {
  try {
    localStorage.setItem(REMEMBER_PREF_KEY, val ? "true" : "false");
    if (!val) {
      localStorage.removeItem(LAST_PROVIDER_KEY);
    }
  } catch {}
}

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

function ProviderIcon({ provider, className = "h-5 w-5" }: { provider: string; className?: string }) {
  if (provider === "google") {
    return (
      <svg className={className} viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
    );
  }
  if (provider === "workos") return <ShieldCheck className={className + " text-indigo-600 dark:text-indigo-400"} />;
  if (provider === "replit") return <KeyRound className={className + " text-orange-600 dark:text-orange-400"} />;
  return <User className={className} />;
}

function providerLabel(p: string) {
  switch (p) {
    case "google": return "Google";
    case "workos": return "WorkOS";
    case "replit": return "Replit";
    default: return "Password";
  }
}

export default function LoginPage() {
  const { login, register, completeTotpLogin } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [showForm, setShowForm] = useState(false);
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
  const [rememberProvider, setRememberProvider] = useState(getRememberPref);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);

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
  const [loginHelpOpen, setLoginHelpOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setLoginHelpOpen((v) => !v);
    window.addEventListener("axtask-toggle-login-help", onToggle);
    return () => window.removeEventListener("axtask-toggle-login-help", onToggle);
  }, []);
  const [loginPretext, setLoginPretext] = useState<string | null>(null);
  const [oauthCallbackErrorCode, setOauthCallbackErrorCode] = useState<string | null>(null);
  const [totpStep, setTotpStep] = useState(false);
  const [totpEmailMask, setTotpEmailMask] = useState<string | undefined>(undefined);
  const [totpCode, setTotpCode] = useState("");
  const lastEmail = getLastEmail();
  const lastProvider = getLastProvider();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      const messages: Record<string, string> = {
        missing_code: "Authentication failed — no authorization code received.",
        session_failed: "Authentication succeeded but session creation failed.",
        auth_failed: "Authentication failed. Please try again.",
        account_suspended: "This account has been suspended. Contact an administrator for assistance.",
        ...SSO_NOT_CONFIGURED_USER_MESSAGES,
      };
      if (isSsoNotConfiguredErrorCode(oauthError)) {
        setOauthCallbackErrorCode(oauthError);
      } else {
        setOauthCallbackErrorCode(null);
      }
      setError(messages[oauthError] || `Authentication error: ${oauthError}`);
      window.history.replaceState({}, "", "/login");
      return;
    }
    if (params.get("step") === "totp") {
      void fetch("/api/auth/totp/pending", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { pending?: boolean; emailMask?: string }) => {
          if (d.pending) {
            setMode("login");
            setShowForm(true);
            setTotpStep(true);
            setTotpEmailMask(d.emailMask);
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", "/login");
      return;
    }
    const token = params.get("reset_token");
    if (token) {
      setMode("forgot");
      setForgotStep("reset");
      setResetToken(token);
      window.history.replaceState({}, "", "/login");
    } else if (params.get("mode") === "register") {
      setMode("register");
      setShowForm(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => {
        setRegMode(d.registrationMode);
        setAuthProvider(d.authProvider || "local");
        setLoginUrl(d.loginUrl || "");
        if (d.providers) setProviders(d.providers);
        const pt = d.loginPretext;
        if (typeof pt === "string" && pt.trim()) setLoginPretext(pt.trim());
        else setLoginPretext(null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const accts = getKnownAccounts().sort((a, b) => b.lastUsed - a.lastUsed);
    setKnownAccounts(accts);
    if (accts.length === 0) setShowForm(true);
  }, []);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const providerLoginUrls: Record<string, string> = {
    google: "/api/auth/google/login",
    replit: "/api/auth/replit/login",
    workos: "/api/auth/workos/login",
  };

  const availableProviderNames = useMemo(() => {
    const names = new Set(providers.map(p => p.name));
    names.add("local");
    return names;
  }, [providers]);

  const isProviderAvailable = useCallback((providerName: string) => {
    return availableProviderNames.has(providerName);
  }, [availableProviderNames]);

  const mostRecentAccount = useMemo(() => {
    if (knownAccounts.length === 0) return null;
    return knownAccounts.reduce((a, b) => (a.lastUsed > b.lastUsed ? a : b));
  }, [knownAccounts]);

  const handlePickAccount = useCallback((acct: KnownAccount) => {
    const url = providerLoginUrls[acct.provider];
    if (url) {
      try {
        const next = new URLSearchParams(window.location.search).get("next");
        if (next) rememberPostLoginRedirectForOAuth(next);
      } catch {
        /* ignore */
      }
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

  const handleToggleRemember = useCallback(() => {
    const next = !rememberProvider;
    setRememberProvider(next);
    setRememberPref(next);
  }, [rememberProvider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        const outcome = await login(email, password);
        if (outcome.status === "totp_required") {
          setTotpStep(true);
          setTotpEmailMask(outcome.emailMask);
          setTotpCode("");
        }
      } else {
        await register(email, password, displayName || undefined, regMode === "invite" ? inviteCode : undefined);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const submitTotpCode = async (code: string) => {
    const c = code.replace(/\D/g, "").slice(0, 6);
    if (c.length !== 6) return;
    setError("");
    setSubmitting(true);
    try {
      await completeTotpLogin(c);
      setTotpStep(false);
      setTotpCode("");
    } catch (err: any) {
      setError(err.message || "Invalid code");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: csrfHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setHasSecurityQ(!!data.hasSecurityQuestion);

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
        method: "POST", headers: csrfHeaders(),
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
        method: "POST", headers: csrfHeaders(),
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
        method: "POST", headers: csrfHeaders(),
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
    setOauthCallbackErrorCode(null);
  };

  const newPasswordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const canRegister = regMode !== "closed";

  const isLastUsedProvider = (providerName: string) => {
    return rememberProvider && lastProvider === providerName;
  };

  const oauthProviderNames = useMemo(() => providers.map((p) => p.name), [providers]);

  const showSsoDownBanner = useMemo(
    () =>
      shouldShowSsoDownBanner({
        oauthProviderCount: oauthProviderNames.length,
        oauthCallbackErrorCode,
        errorMessage: error,
      }),
    [oauthProviderNames.length, oauthCallbackErrorCode, error],
  );

  const providerButtonClass = (providerName: string, base: string) => {
    if (isLastUsedProvider(providerName)) {
      return base + " ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-800 bg-primary/5 dark:bg-primary/10";
    }
    return base;
  };

  return (
    <PretextShell
      chips={["Focus", "Flow", "Ship", "Rest", "Repeat"]}
      className="relative min-h-dvh w-full overflow-y-auto flex items-center justify-center px-4 py-8"
    >
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8" id="login-help-header">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
              <CheckSquare className="h-6 w-6 text-emerald-300" />
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">AxTask</span>
          </div>
          <p className="text-slate-400">
            Tasks are fleeting — your focus is not
          </p>
          {loginPretext ? (
            <p className="mt-3 text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              {loginPretext}
            </p>
          ) : null}
        </div>

        <div
          id="login-help-card"
          className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/20 p-8"
        >
          {totpStep && mode === "login" ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-100 mb-2">Authenticator code</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Enter the 6-digit code from Google Authenticator or Microsoft Authenticator
                {totpEmailMask ? (
                  <>
                    {" "}
                    for <span className="font-medium text-foreground">{totpEmailMask}</span>
                  </>
                ) : null}
                .
              </p>
              <div className="flex justify-center py-2">
                <InputOTP
                  maxLength={6}
                  value={totpCode}
                  onChange={(v) => {
                    const next = v.replace(/\D/g, "").slice(0, 6);
                    setTotpCode(next);
                    if (next.length === 6) void submitTotpCode(next);
                  }}
                  disabled={submitting}
                  containerClassName="gap-1.5"
                >
                  <InputOTPGroup className="gap-1.5">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-11 w-10 rounded-md border-white/20 bg-white/5"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              ) : null}
              <Button
                type="button"
                className={cn("w-full h-11", pretextGradientCtaClassName)}
                disabled={submitting || totpCode.replace(/\D/g, "").length !== 6}
                onClick={() => void submitTotpCode(totpCode)}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify and continue
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary"
                onClick={() => {
                  setTotpStep(false);
                  setTotpCode("");
                  setError("");
                }}
              >
                ← Back to password
              </button>
            </div>
          ) : (
          <>
          {mode === "login" && showSsoDownBanner ? (
            <div
              id="login-help-sso-banner"
              className="mb-5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 px-3 py-3 text-sm text-amber-950 dark:text-amber-100"
            >
              <p className="leading-snug">
                Single sign-on may be turned off or unreachable here. Use{" "}
                <strong className="font-medium">email and password</strong>, or open{" "}
                <strong className="font-medium">Help</strong> for a quick walkthrough.
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200 underline hover:no-underline"
                onClick={() => setLoginHelpOpen(true)}
              >
                Show me how
              </button>
            </div>
          ) : null}
          <h2 className="text-xl font-semibold text-slate-100 mb-6">
            {mode === "forgot"
              ? forgotStep === "done" ? "Success" : "Reset your password"
              : mode === "login"
                ? !showForm && knownAccounts.length > 0
                  ? "Choose an account"
                  : showForm ? "Sign in to your account" : "Sign in"
                : "Create your account"}
          </h2>

          {mode === "login" && !showForm && knownAccounts.length > 0 && (
            <div className="space-y-2">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              )}

              {mostRecentAccount && knownAccounts.length === 1 && (
                <div className="mb-3">
                  {isProviderAvailable(mostRecentAccount.provider) ? (
                    <button
                      onClick={() => handlePickAccount(mostRecentAccount)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-primary bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/20 transition-all text-left group"
                    >
                      {mostRecentAccount.provider === "google" ? (
                        <div className="h-12 w-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                          <ProviderIcon provider="google" />
                        </div>
                      ) : mostRecentAccount.provider === "workos" ? (
                        <div className="h-12 w-12 rounded-full bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center shrink-0">
                          <ProviderIcon provider="workos" />
                        </div>
                      ) : mostRecentAccount.provider === "replit" ? (
                        <div className="h-12 w-12 rounded-full bg-orange-500/15 border border-orange-400/30 flex items-center justify-center shrink-0">
                          <ProviderIcon provider="replit" />
                        </div>
                      ) : (
                        <Avatar name={mostRecentAccount.displayName || mostRecentAccount.email} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-100 truncate flex items-center gap-2">
                          Continue as {mostRecentAccount.displayName || mostRecentAccount.email.split("@")[0]}
                          <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 shrink-0">
                            <Clock className="h-2.5 w-2.5" /> Last used
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {mostRecentAccount.email} · {providerLabel(mostRecentAccount.provider)}
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ) : (
                    <div className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-white/10 bg-white/5 text-left">
                      <Avatar name={mostRecentAccount.displayName || mostRecentAccount.email} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-100 truncate">
                          {mostRecentAccount.displayName || mostRecentAccount.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-amber-600 dark:text-amber-400 truncate">
                          {providerLabel(mostRecentAccount.provider)} is currently unavailable — please use another sign-in method
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {knownAccounts.length > 1 && (
                <>
                  {knownAccounts.map((acct) => {
                    const available = isProviderAvailable(acct.provider);
                    return (
                    <div
                      key={acct.email}
                      role="button"
                      tabIndex={0}
                      onClick={() => available ? handlePickAccount(acct) : undefined}
                      onKeyDown={(e) => { if (available && (e.key === "Enter" || e.key === " ")) handlePickAccount(acct); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left group ${
                        !available
                          ? "border-white/10 bg-white/[0.03] opacity-60 cursor-not-allowed"
                          : acct.email === lastEmail
                          ? "border-emerald-400/35 bg-emerald-500/10 hover:bg-emerald-500/15 cursor-pointer"
                          : "border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer"
                      }`}
                    >
                      {acct.provider === "google" ? (
                        <div className="h-10 w-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                          <ProviderIcon provider="google" />
                        </div>
                      ) : acct.provider === "workos" ? (
                        <div className="h-10 w-10 rounded-full bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center shrink-0">
                          <ProviderIcon provider="workos" />
                        </div>
                      ) : acct.provider === "replit" ? (
                        <div className="h-10 w-10 rounded-full bg-orange-500/15 border border-orange-400/30 flex items-center justify-center shrink-0">
                          <ProviderIcon provider="replit" />
                        </div>
                      ) : (
                        <Avatar name={acct.displayName || acct.email} />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-100 text-sm truncate">
                          {acct.displayName || acct.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                          {acct.email}
                          <span className="text-[10px] text-gray-400">
                            · {providerLabel(acct.provider)}
                          </span>
                          {!available && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">· unavailable</span>
                          )}
                        </div>
                      </div>

                      {acct.email === lastEmail && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <Clock className="h-2.5 w-2.5" /> Last used
                        </span>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveAccount(e, acct.email); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity shrink-0"
                        title="Forget this account"
                      >
                        <X className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    </div>
                    );
                  })}
                </>
              )}

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or</span></div>
              </div>

              <div id="login-help-oauth" className="flex flex-wrap gap-2">
                <a href="/api/auth/google/login"
                  onClick={() => persistNextBeforeExternalAuth()}
                  className={providerButtonClass("google", "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm text-slate-200")}>
                  <ProviderIcon provider="google" className="h-4 w-4" />
                  Google
                  {isLastUsedProvider("google") && <span className="text-[9px] text-primary font-medium">★</span>}
                </a>
                <a href="/api/auth/replit/login"
                  onClick={() => persistNextBeforeExternalAuth()}
                  className={providerButtonClass("replit", "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm text-slate-200")}>
                  <KeyRound className="h-4 w-4" />
                  Replit
                  {isLastUsedProvider("replit") && <span className="text-[9px] text-primary font-medium">★</span>}
                </a>
                <a href="/api/auth/workos/login"
                  onClick={() => persistNextBeforeExternalAuth()}
                  className={providerButtonClass("workos", "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm text-slate-200")}>
                  <ShieldCheck className="h-4 w-4" />
                  WorkOS
                  {isLastUsedProvider("workos") && <span className="text-[9px] text-primary font-medium">★</span>}
                </a>
                <button
                  type="button"
                  id="login-help-password-cta"
                  onClick={() => { setShowForm(true); setEmail(""); setError(""); }}
                  className={providerButtonClass("local", "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/25 bg-white/[0.04] hover:bg-white/10 transition-all text-sm text-slate-300")}
                >
                  <User className="h-4 w-4" />
                  Password
                  {isLastUsedProvider("local") && <span className="text-[9px] text-primary font-medium">★</span>}
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 mt-1">
                <button
                  onClick={handleToggleRemember}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {rememberProvider ? (
                    <ToggleRight className="h-4 w-4 text-primary" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                  Remember my login method
                </button>
                <button
                  onClick={() => setShowSecurityInfo(!showSecurityInfo)}
                  className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
                  title="What's stored?"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              {showSecurityInfo && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 leading-relaxed">
                  Only your display name, email, and provider type (e.g. "Google") are stored locally to speed up sign-in. No passwords, tokens, or session data are ever saved in your browser.
                </div>
              )}
            </div>
          )}

          {mode === "login" && !showForm && knownAccounts.length === 0 && (
            <div className="space-y-3">
              <div id="login-help-oauth" className="space-y-3">
                <a
                  href="/api/auth/google/login"
                  onClick={() => persistNextBeforeExternalAuth()}
                  className={providerButtonClass("google", "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all font-medium text-slate-100")}
                >
                  <ProviderIcon provider="google" />
                  Continue with Google
                  {isLastUsedProvider("google") && <span className="text-xs text-primary font-medium ml-1">★ Last used</span>}
                </a>

                <a
                  href="/api/auth/replit/login"
                  onClick={() => persistNextBeforeExternalAuth()}
                  className={providerButtonClass("replit", "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all font-medium text-slate-100")}
                >
                  <KeyRound className="h-5 w-5" />
                  Sign in with Replit
                  {isLastUsedProvider("replit") && <span className="text-xs text-primary font-medium ml-1">★ Last used</span>}
                </a>

                <a
                  href="/api/auth/workos/login"
                  onClick={() => persistNextBeforeExternalAuth()}
                  className={providerButtonClass("workos", "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all font-medium text-slate-100")}
                >
                  <ShieldCheck className="h-5 w-5" />
                  Continue with WorkOS
                  {isLastUsedProvider("workos") && <span className="text-xs text-primary font-medium ml-1">★ Last used</span>}
                </a>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  {error}
                </p>
              )}

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or use email & password</span></div>
              </div>

              <button
                type="button"
                id="login-help-password-cta"
                onClick={() => setShowForm(true)}
                className={providerButtonClass("local", "w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all")}
              >
                Sign in with email & password
                {isLastUsedProvider("local") && <span className="text-xs text-primary font-medium ml-1">★ Last used</span>}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleToggleRemember}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {rememberProvider ? (
                    <ToggleRight className="h-4 w-4 text-primary" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                  Remember my login method
                </button>
                <button
                  onClick={() => setShowSecurityInfo(!showSecurityInfo)}
                  className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
                  title="What's stored?"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              {showSecurityInfo && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 leading-relaxed">
                  Only your display name, email, and provider type (e.g. "Google") are stored locally to speed up sign-in. No passwords, tokens, or session data are ever saved in your browser.
                </div>
              )}
            </div>
          )}

          {mode !== "forgot" && (showForm || mode === "register") && (
            <>
              {mode === "login" && (
                <div id="login-help-oauth" className="space-y-2 mb-4">
                  <a href="/api/auth/google/login"
                    onClick={() => persistNextBeforeExternalAuth()}
                    className={providerButtonClass("google", "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm font-medium text-slate-100")}>
                    <ProviderIcon provider="google" className="h-4 w-4" />
                    Continue with Google
                    {isLastUsedProvider("google") && <span className="text-[10px] text-primary font-medium">★</span>}
                  </a>
                  <a href="/api/auth/replit/login"
                    onClick={() => persistNextBeforeExternalAuth()}
                    className={providerButtonClass("replit", "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm font-medium text-slate-100")}>
                    <KeyRound className="h-4 w-4" />
                    Sign in with Replit
                    {isLastUsedProvider("replit") && <span className="text-[10px] text-primary font-medium">★</span>}
                  </a>
                  <a href="/api/auth/workos/login"
                    onClick={() => persistNextBeforeExternalAuth()}
                    className={providerButtonClass("workos", "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-sm font-medium text-slate-100")}>
                    <ShieldCheck className="h-4 w-4" />
                    Continue with WorkOS
                    {isLastUsedProvider("workos") && <span className="text-[10px] text-primary font-medium">★</span>}
                  </a>
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-700" /></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or use email & password</span></div>
                  </div>
                </div>
              )}
            <form
              onSubmit={handleSubmit}
              className="space-y-4"
              id={
                (mode === "login" && showForm) || mode === "register"
                  ? "login-help-password-cta"
                  : undefined
              }
            >
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

              <Button
                type="submit"
                className={cn("w-full h-11", pretextGradientCtaClassName)}
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>

              {mode === "login" && (
                <button
                  type="button"
                  id="login-help-forgot-link"
                  onClick={() => { setMode("forgot"); setForgotStep("email"); setError(""); }}
                  className="w-full text-center text-xs text-gray-400 hover:text-primary transition-colors"
                >
                  Forgot your password?
                </button>
              )}

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

          {mode === "forgot" && (
            <div className="space-y-4">
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

              {forgotStep !== "done" && (
                <button type="button" onClick={resetForgotFlow}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary">
                  ← Back to sign in
                </button>
              )}
            </div>
          )}

          </>
          )}

          <div className="mt-6 flex flex-col items-center gap-3 text-center text-sm text-gray-500 dark:text-gray-400">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setLoginHelpOpen(true)}
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
                Help / tutorial
              </button>
              <span className="text-gray-300 dark:text-gray-600 hidden sm:inline" aria-hidden>
                |
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Shortcut: Ctrl+Shift+H (Cmd+Shift+H on Mac) — focus the page, not the bar
              </span>
              <span className="text-gray-300 dark:text-gray-600 hidden sm:inline" aria-hidden>
                |
              </span>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                Contact &amp; email
              </Link>
            </div>
            {mode === "login" ? (
              canRegister ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    id="login-help-register"
                    onClick={() => { setMode("register"); setShowForm(true); setError(""); }}
                    className="text-primary hover:underline font-medium"
                  >
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

        <div className="mt-6 flex justify-center">
          <DonateCta variant="outline" className="bg-card/90 border-border backdrop-blur-sm" />
        </div>

        <LoginHelpOverlay
          oauthProviderNames={oauthProviderNames}
          isOpen={loginHelpOpen}
          onOpenChange={setLoginHelpOpen}
        />
      </div>
    </PretextShell>
  );
}
