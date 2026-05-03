import { ArrowRight, Clock, X, User, ToggleLeft, ToggleRight, Info } from "lucide-react";
import { providerShortLabel } from "@/lib/auth-provider-labels";
import type { KnownAccount } from "./known-accounts-storage";
import { Avatar, ProviderIcon } from "./provider-icons";
import { OAuthProviderCompactRow, type OAuthProviderInfo } from "./oauth-provider-links";

export function KnownAccountChooser({
  knownAccounts,
  mostRecentAccount,
  lastEmail,
  error,
  isProviderAvailable,
  onPickAccount,
  onRemoveAccount,
  onUseAnotherAccount,
  onForgetMostRecent,
  providers,
  persistNextBeforeExternalAuth,
  isLastUsedProvider,
  providerButtonClass,
  rememberProvider,
  onToggleRemember,
  showSecurityInfo,
  onToggleSecurityInfo,
}: {
  knownAccounts: KnownAccount[];
  mostRecentAccount: KnownAccount | null;
  lastEmail: string;
  error: string;
  isProviderAvailable: (providerName: string) => boolean;
  onPickAccount: (acct: KnownAccount) => void;
  onRemoveAccount: (e: React.MouseEvent, email: string) => void;
  onUseAnotherAccount: () => void;
  /** When only one saved account exists, clear it from this device. */
  onForgetMostRecent: () => void;
  providers: OAuthProviderInfo[];
  persistNextBeforeExternalAuth: () => void;
  isLastUsedProvider: (name: string) => boolean;
  providerButtonClass: (providerName: string, base: string) => string;
  rememberProvider: boolean;
  onToggleRemember: () => void;
  showSecurityInfo: boolean;
  onToggleSecurityInfo: () => void;
}) {
  return (
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
              type="button"
              onClick={() => onPickAccount(mostRecentAccount)}
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
                  {mostRecentAccount.email} · {providerShortLabel(mostRecentAccount.provider)}
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
                  {providerShortLabel(mostRecentAccount.provider)} is currently unavailable — please use another
                  sign-in method
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={onUseAnotherAccount}
              className="w-full text-center text-sm font-medium text-primary hover:underline py-1"
            >
              Use another account
            </button>
            <button
              type="button"
              onClick={onForgetMostRecent}
              className="w-full text-center text-xs text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 py-1"
            >
              Remove saved account from this device
            </button>
          </div>
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
                onClick={() => (available ? onPickAccount(acct) : undefined)}
                onKeyDown={(e) => {
                  if (available && (e.key === "Enter" || e.key === " ")) onPickAccount(acct);
                }}
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
                    <span className="text-[10px] text-gray-400">· {providerShortLabel(acct.provider)}</span>
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
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAccount(e, acct.email);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity shrink-0"
                  title="Forget this account"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onUseAnotherAccount}
            className="w-full text-center text-sm font-medium text-primary hover:underline py-2"
          >
            Use another account
          </button>
        </>
      )}

      {providers.length > 0 && (
        <>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or</span>
            </div>
          </div>

          <div id="login-help-oauth">
            <OAuthProviderCompactRow
              providers={providers}
              persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
              isLastUsedProvider={isLastUsedProvider}
              providerButtonClass={providerButtonClass}
            />
          </div>

          <button
            type="button"
            id="login-help-password-cta"
            onClick={onUseAnotherAccount}
            className={providerButtonClass(
              "local",
              "w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/25 bg-white/[0.04] hover:bg-white/10 transition-all text-sm text-slate-300",
            )}
          >
            <User className="h-4 w-4" />
            Sign in with email and password
            {isLastUsedProvider("local") && <span className="text-[9px] text-primary font-medium">★</span>}
          </button>
        </>
      )}

      {providers.length === 0 && (
        <button
          type="button"
          id="login-help-password-cta"
          onClick={onUseAnotherAccount}
          className={providerButtonClass(
            "local",
            "w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/25 bg-white/[0.04] hover:bg-white/10 transition-all text-sm text-slate-300",
          )}
        >
          <User className="h-4 w-4" />
          Sign in with email and password
          {isLastUsedProvider("local") && <span className="text-[9px] text-primary font-medium">★</span>}
        </button>
      )}

      <div className="flex items-center justify-between pt-2 mt-1">
        <button
          type="button"
          onClick={onToggleRemember}
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
          type="button"
          onClick={onToggleSecurityInfo}
          className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
          title="What's stored?"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      {showSecurityInfo && (
        <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 leading-relaxed">
          Only your display name, email, and sign-in method (e.g. &quot;Google&quot;) are stored locally to speed up
          sign-in. No passwords, tokens, or session data are ever saved in your browser.
        </div>
      )}
    </div>
  );
}
