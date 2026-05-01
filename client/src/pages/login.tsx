import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  SSO_NOT_CONFIGURED_USER_MESSAGES,
  isSsoNotConfiguredErrorCode,
  shouldShowSsoDownBanner,
} from "@/lib/sso-down-banner";
import { useAuth } from "@/lib/auth-context";
import { getCsrfToken } from "@/lib/queryClient";
import { AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { DonateCta } from "@/components/donate-cta";
import { LoginHelpOverlay } from "@/components/login-help-overlay";
import { Input } from "@/components/ui/input";
import { SecureInput } from "@/components/ui/secure-input";
import { Label } from "@/components/ui/label";
import { CheckSquare, Loader2, ShieldCheck, Eye, EyeOff, HelpCircle } from "lucide-react";
import { PretextShell } from "@/components/pretext/pretext-shell";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";
import { cn } from "@/lib/utils";
import { rememberPostLoginRedirectForOAuth } from "@/lib/post-login-redirect";
import { TotpStep } from "@/pages/login/totp-step";
import { SsoFallbackBanner } from "@/pages/login/sso-fallback-banner";
import { KnownAccountChooser } from "@/pages/login/known-account-chooser";
import { FirstTimeSignInOptions } from "@/pages/login/first-time-sign-in-options";
import { ForgotPasswordFlow, type ForgotStep } from "@/pages/login/forgot-password-flow";
import {
  forgetAccount,
  getKnownAccounts,
  getLastEmail,
  getLastProvider,
  getRememberPref,
  setRememberPref,
  type KnownAccount,
} from "@/pages/login/known-accounts-storage";
import { OAuthProviderStackedList, type OAuthProviderInfo } from "@/pages/login/oauth-provider-links";
import { EmailPasswordForm } from "@/pages/login/email-password-form";
import { RegisterForm } from "@/pages/login/register-form";

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token
    ? { "Content-Type": "application/json", [AXTASK_CSRF_HEADER]: token }
    : { "Content-Type": "application/json" };
}

function persistNextBeforeExternalAuth() {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) rememberPostLoginRedirectForOAuth(next);
  } catch {
    /* ignore */
  }
}

export default function LoginPage() {
  const { login, register, completeTotpLogin } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);
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
  const [inviteConfigured, setInviteConfigured] = useState<boolean>(true);
  const [authProvider, setAuthProvider] = useState<string>("local");
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);
  const [rememberProvider, setRememberProvider] = useState(getRememberPref);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);

  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [resetToken, setResetToken] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        setInviteConfigured(d.inviteConfigured ?? true);
        setAuthProvider(d.authProvider || "local");
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
  }, []);

  const providerLoginUrls: Record<string, string> = {
    google: "/api/auth/google/login",
    replit: "/api/auth/replit/login",
    workos: "/api/auth/workos/login",
  };

  const availableProviderNames = useMemo(() => {
    const names = new Set(providers.map((p) => p.name));
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

  const handleRemoveAccount = useCallback((e: React.MouseEvent, rmEmail: string) => {
    e.stopPropagation();
    forgetAccount(rmEmail);
    const updated = getKnownAccounts();
    setKnownAccounts(updated);
    if (updated.length === 0) setShowForm(false);
  }, []);

  const handleForgetMostRecent = useCallback(() => {
    if (!mostRecentAccount) return;
    forgetAccount(mostRecentAccount.email);
    const updated = getKnownAccounts();
    setKnownAccounts(updated);
    if (updated.length === 0) setShowForm(false);
    setError("");
  }, [mostRecentAccount]);

  const openEmailPasswordPath = useCallback(() => {
    setShowForm(true);
    setEmail("");
    setError("");
    setPassword("");
    queueMicrotask(() => emailRef.current?.focus());
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
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

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
    } finally {
      setSubmitting(false);
    }
  };

  const handleFetchSecurityQuestion = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/security-question", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSecurityQuestion(data.question);
      setForgotStep("security");
    } catch (err: any) {
      setError(err.message || "No security question available");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySecurityAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-security-answer", {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ email, answer: securityAnswer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResetToken(data.token);
      setForgotStep("reset");
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setSubmitting(false);
    }
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
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccessMessage("Password reset successfully! You can now sign in.");
      setForgotStep("done");
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setSubmitting(false);
    }
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
    if (knownAccounts.length === 0) setShowForm(false);
  };

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
      return (
        base +
        " ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-800 bg-primary/5 dark:bg-primary/10"
      );
    }
    return base;
  };

  const cardTitle =
    mode === "forgot"
      ? forgotStep === "done"
        ? "Success"
        : "Reset your password"
      : mode === "login"
        ? !showForm && knownAccounts.length > 0
          ? "Choose an account"
          : showForm
            ? "Sign in to your account"
            : "Sign in"
        : "Create your account";

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
            <span className="text-3xl font-bold bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
              AxTask
            </span>
          </div>
          <p className="text-slate-400">Tasks are fleeting — your focus is not</p>
          {loginPretext ? (
            <p className="mt-3 text-sm text-slate-400 max-w-md mx-auto leading-relaxed">{loginPretext}</p>
          ) : null}
        </div>

        <div
          id="login-help-card"
          className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/20 p-8 axtask-calm-blur-fallback"
        >
          {totpStep && mode === "login" ? (
            <TotpStep
              totpEmailMask={totpEmailMask}
              totpCode={totpCode}
              setTotpCode={setTotpCode}
              submitting={submitting}
              error={error}
              onSubmitCode={submitTotpCode}
              onBack={() => {
                setTotpStep(false);
                setTotpCode("");
                setError("");
              }}
            />
          ) : (
            <>
              {mode === "login" && showSsoDownBanner ? (
                <SsoFallbackBanner
                  onUseEmailPassword={() => {
                    setLoginHelpOpen(false);
                    openEmailPasswordPath();
                  }}
                  onShowHelp={() => setLoginHelpOpen(true)}
                />
              ) : null}
              <h2 className="text-xl font-semibold text-slate-100 mb-6">{cardTitle}</h2>

              {mode === "login" && !showForm && knownAccounts.length > 0 && (
                <KnownAccountChooser
                  knownAccounts={knownAccounts}
                  mostRecentAccount={mostRecentAccount}
                  lastEmail={lastEmail}
                  error={error}
                  isProviderAvailable={isProviderAvailable}
                  onPickAccount={handlePickAccount}
                  onRemoveAccount={handleRemoveAccount}
                  onUseAnotherAccount={openEmailPasswordPath}
                  onForgetMostRecent={handleForgetMostRecent}
                  providers={providers}
                  persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
                  isLastUsedProvider={isLastUsedProvider}
                  providerButtonClass={providerButtonClass}
                  rememberProvider={rememberProvider}
                  onToggleRemember={handleToggleRemember}
                  showSecurityInfo={showSecurityInfo}
                  onToggleSecurityInfo={() => setShowSecurityInfo(!showSecurityInfo)}
                />
              )}

              {mode === "login" && !showForm && knownAccounts.length === 0 && (
                <FirstTimeSignInOptions
                  providers={providers}
                  authProvider={authProvider}
                  error={error}
                  rememberProvider={rememberProvider}
                  onToggleRemember={handleToggleRemember}
                  showSecurityInfo={showSecurityInfo}
                  onToggleSecurityInfo={() => setShowSecurityInfo(!showSecurityInfo)}
                  isLastUsedProvider={isLastUsedProvider}
                  providerButtonClass={providerButtonClass}
                  persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
                  onOpenEmailPassword={openEmailPasswordPath}
                  canRegister={canRegister}
                  onCreateAccount={() => {
                    setMode("register");
                    setShowForm(true);
                    setError("");
                  }}
                  onNeedHelp={() => setLoginHelpOpen(true)}
                />
              )}


              {mode === "login" && showForm && (
                <EmailPasswordForm
                  emailRef={emailRef}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  error={error}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                  onForgot={() => {
                    setMode("forgot");
                    setForgotStep("email");
                    setError("");
                  }}
                  onBackToAccounts={(knownAccounts.length > 0) ? () => {
                    setShowForm(false);
                    setError("");
                    setPassword("");
                  } : undefined}
                  onBackToOptions={knownAccounts.length === 0 ? () => {
                    setShowForm(false);
                    setError("");
                    setPassword("");
                  } : undefined}
                  providers={providers}
                  persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
                  isLastUsedProvider={isLastUsedProvider}
                  providerButtonClass={providerButtonClass}
                />
              )}

              {mode === "register" && (
                <RegisterForm
                  displayName={displayName}
                  setDisplayName={setDisplayName}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  error={error}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                  regMode={regMode}
                  inviteConfigured={inviteConfigured}
                  inviteCode={inviteCode}
                  setInviteCode={setInviteCode}
                />
              )}

              {mode === "forgot" && (
                <ForgotPasswordFlow
                  forgotStep={forgotStep}
                  email={email}
                  setEmail={setEmail}
                  error={error}
                  submitting={submitting}
                  onSubmitEmail={handleForgotSubmitEmail}
                  onFetchSecurityQuestion={handleFetchSecurityQuestion}
                  securityQuestion={securityQuestion}
                  securityAnswer={securityAnswer}
                  setSecurityAnswer={setSecurityAnswer}
                  onVerifySecurityAnswer={handleVerifySecurityAnswer}
                  newPassword={newPassword}
                  setNewPassword={setNewPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  onResetPassword={handleResetPassword}
                  successMessage={successMessage}
                  onBackToSignIn={resetForgotFlow}
                />
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
              <Link href="/contact" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
                Contact &amp; email
              </Link>
              <span className="text-gray-300 dark:text-gray-600 hidden sm:inline" aria-hidden>
                |
              </span>
              <Link href="/privacy" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
                Privacy
              </Link>
              <span className="text-gray-300 dark:text-gray-600 hidden sm:inline" aria-hidden>
                |
              </span>
              <Link href="/terms" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
                Terms
              </Link>
            </div>
            {mode === "login" ? (
              canRegister ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    id="login-help-register"
                    onClick={() => {
                      setMode("register");
                      setShowForm(true);
                      setError("");
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    Get started
                  </button>
                </>
              ) : null
            ) : mode === "register" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-primary hover:underline font-medium"
                >
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
