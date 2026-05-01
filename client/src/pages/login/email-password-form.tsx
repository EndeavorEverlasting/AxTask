import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SecureInput } from "@/components/ui/secure-input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";
import { OAuthProviderStackedList, type OAuthProviderInfo } from "@/pages/login/oauth-provider-links";

interface EmailPasswordFormProps {
  emailRef: React.RefObject<HTMLInputElement>;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  error: string;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
  onBackToAccounts?: () => void;
  onBackToOptions?: () => void;
  providers: OAuthProviderInfo[];
  persistNextBeforeExternalAuth: () => void;
  isLastUsedProvider: (name: string) => boolean;
  providerButtonClass: (name: string, base: string) => string;
}

export function EmailPasswordForm({
  emailRef,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  submitting,
  onSubmit,
  onForgot,
  onBackToAccounts,
  onBackToOptions,
  providers,
  persistNextBeforeExternalAuth,
  isLastUsedProvider,
  providerButtonClass,
}: EmailPasswordFormProps) {
  return (
    <>
      {providers.length > 0 && (
        <div id="login-help-oauth" className="space-y-2 mb-4">
          <OAuthProviderStackedList
            providers={providers}
            persistNextBeforeExternalAuth={persistNextBeforeExternalAuth}
            isLastUsedProvider={isLastUsedProvider}
            providerButtonClass={providerButtonClass}
            size="sm"
          />
          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-gray-800 px-2 text-gray-400">
                or use email and password
              </span>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" id="login-help-password-cta">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailRef}
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1"
            autoComplete="email"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1">
            <SecureInput
              id="password"
              type={showPassword ? "text" : "password"}
              alwaysMask={!showPassword}
              required
              minLength={1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              inactivityTimeout={60}
              onInactivityClear={() => setPassword("")}
              placeholder="••••••••"
              className="pr-16"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

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
          Sign in
        </Button>

        <button
          type="button"
          id="login-help-forgot-link"
          onClick={onForgot}
          className="w-full text-center text-xs text-gray-400 hover:text-primary transition-colors"
        >
          Forgot your password?
        </button>

        {onBackToAccounts && (
          <button
            type="button"
            onClick={onBackToAccounts}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary"
          >
            ← Choose a saved account
          </button>
        )}
        {onBackToOptions && (
          <button
            type="button"
            onClick={onBackToOptions}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary"
          >
            ← Other sign-in options
          </button>
        )}
      </form>
    </>
  );
}
