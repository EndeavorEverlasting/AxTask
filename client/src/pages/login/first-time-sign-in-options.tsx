import { User, ToggleLeft, ToggleRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";
import { Button } from "@/components/ui/button";
import {
  OAuthProviderStackedList,
  orderProvidersForDisplay,
  type OAuthProviderInfo,
} from "./oauth-provider-links";

export function FirstTimeSignInOptions({
  providers,
  authProvider,
  error,
  rememberProvider,
  onToggleRemember,
  showSecurityInfo,
  onToggleSecurityInfo,
  isLastUsedProvider,
  providerButtonClass,
  persistNextBeforeExternalAuth,
  onOpenEmailPassword,
}: {
  providers: OAuthProviderInfo[];
  authProvider: string;
  error: string;
  rememberProvider: boolean;
  onToggleRemember: () => void;
  showSecurityInfo: boolean;
  onToggleSecurityInfo: () => void;
  isLastUsedProvider: (name: string) => boolean;
  providerButtonClass: (providerName: string, base: string) => string;
  persistNextBeforeExternalAuth: () => void;
  onOpenEmailPassword: () => void;
}) {
  const ordered = orderProvidersForDisplay(providers, authProvider);
  const isServerPrimarySso =
    authProvider !== "local" && ordered.some((p) => p.name === authProvider);
  const primarySso = isServerPrimarySso ? ordered.find((p) => p.name === authProvider)! : null;
  const otherSso = isServerPrimarySso ? ordered.filter((p) => p.name !== authProvider) : ordered;

  const emailPrimaryCta = (
    <Button
      type="button"
      id="login-help-password-cta"
      data-testid="login-primary-email"
      className={providerButtonClass("local", cn("w-full h-12 text-base", pretextGradientCtaClassName))}
      onClick={onOpenEmailPassword}
    >
      <User className="h-5 w-5 mr-2 shrink-0" />
      Sign in with email and password
      {isLastUsedProvider("local") && <span className="text-xs font-medium ml-2 opacity-90">★ Last used</span>}
    </Button>
  );

  const rememberRow = (
    <div className="flex items-center justify-between pt-1">
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
  );

  const securityBlurb = showSecurityInfo ? (
    <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2.5 leading-relaxed">
      Only your display name, email, and sign-in method (e.g. &quot;Google&quot;) are stored locally to speed up
      sign-in. No passwords, tokens, or session data are ever saved in your browser.
    </div>
  ) : null;

  if (providers.length === 0) {
    return (
      <div className="space-y-3">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            {error}
          </p>
        ) : null}
        {emailPrimaryCta}
        {rememberRow}
        {securityBlurb}
      </div>
    );
  }

  if (isServerPrimarySso && primarySso) {
    return (
      <div className="space-y-3">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            {error}
          </p>
        ) : null}
        <div id="login-help-oauth" className="space-y-3">
          <div data-testid="login-primary-sso">
            <OAuthProviderStackedList
              providers={[primarySso]}
              persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
              isLastUsedProvider={isLastUsedProvider}
              providerButtonClass={providerButtonClass}
              size="md"
              testIdPrefix="login-oauth-primary"
            />
          </div>
          {otherSso.length > 0 ? (
            <>
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white dark:bg-gray-800 px-2 text-gray-400">More sign-in options</span>
                </div>
              </div>
              <OAuthProviderStackedList
                providers={otherSso}
                persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
                isLastUsedProvider={isLastUsedProvider}
                providerButtonClass={providerButtonClass}
                size="md"
              />
            </>
          ) : null}
        </div>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white dark:bg-gray-800 px-2 text-gray-400">or sign in with email</span>
          </div>
        </div>
        <button
          type="button"
          id="login-help-password-cta"
          data-testid="login-secondary-email"
          onClick={onOpenEmailPassword}
          className={providerButtonClass(
            "local",
            "w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all",
          )}
        >
          Sign in with email and password
          {isLastUsedProvider("local") && <span className="text-xs text-primary font-medium ml-1">★ Last used</span>}
        </button>
        {rememberRow}
        {securityBlurb}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          {error}
        </p>
      ) : null}
      <div data-testid="login-primary-email-wrap">{emailPrimaryCta}</div>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white dark:bg-gray-800 px-2 text-gray-400">More sign-in options</span>
        </div>
      </div>
      <div id="login-help-oauth">
        <OAuthProviderStackedList
          providers={ordered}
          persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
          isLastUsedProvider={isLastUsedProvider}
          providerButtonClass={providerButtonClass}
          size="md"
        />
      </div>
      {rememberRow}
      {securityBlurb}
    </div>
  );
}
