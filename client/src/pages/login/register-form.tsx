import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SecureInput } from "@/components/ui/secure-input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { pretextGradientCtaClassName } from "@/components/pretext/pretext-confirmation-shell";

interface RegisterFormProps {
  displayName: string;
  setDisplayName: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  error: string;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  regMode: string;
  inviteConfigured: boolean;
  inviteCode: string;
  setInviteCode: (val: string) => void;
}

export function RegisterForm({
  displayName,
  setDisplayName,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  submitting,
  onSubmit,
  regMode,
  inviteConfigured,
  inviteCode,
  setInviteCode,
}: RegisterFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="displayName">Name (optional)</Label>
        <Input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            inactivityTimeout={60}
            onInactivityClear={() => setPassword("")}
            placeholder="Min 8 chars, A-z, 0-9, !@#"
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

        {password.length > 0 && (
          <div className="mt-3">
            <ul className="text-xs space-y-1.5 ml-1 text-gray-500 dark:text-gray-400">
              <li className={cn("flex items-center gap-2 transition-colors", password.length >= 8 ? "text-green-600 dark:text-green-500 font-medium" : "")}>
                {password.length >= 8 ? <ShieldCheck className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />}
                8+ characters
              </li>
              <li className={cn("flex items-center gap-2 transition-colors", /[A-Z]/.test(password) ? "text-green-600 dark:text-green-500 font-medium" : "")}>
                {/[A-Z]/.test(password) ? <ShieldCheck className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />}
                an uppercase letter
              </li>
              <li className={cn("flex items-center gap-2 transition-colors", /[a-z]/.test(password) ? "text-green-600 dark:text-green-500 font-medium" : "")}>
                {/[a-z]/.test(password) ? <ShieldCheck className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />}
                a lowercase letter
              </li>
              <li className={cn("flex items-center gap-2 transition-colors", /[0-9]/.test(password) ? "text-green-600 dark:text-green-500 font-medium" : "")}>
                {/[0-9]/.test(password) ? <ShieldCheck className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />}
                a number
              </li>
              <li className={cn("flex items-center gap-2 transition-colors", /[^A-Za-z0-9]/.test(password) ? "text-green-600 dark:text-green-500 font-medium" : "")}>
                {/[^A-Za-z0-9]/.test(password) ? <ShieldCheck className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />}
                a symbol
              </li>
            </ul>
          </div>
        )}
      </div>

      {regMode === "invite" && !inviteConfigured ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 p-4 rounded-lg text-sm space-y-2">
          <p>Signup is temporarily unavailable. The server is set to invite-only, but no invite code is configured.</p>
          <p className="font-medium">Existing users can still sign in.</p>
        </div>
      ) : regMode === "invite" && inviteConfigured ? (
        <div>
          <Label htmlFor="inviteCode">Invite Code</Label>
          <Input
            id="inviteCode"
            type="text"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter your invite code"
            className="mt-1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ) : null}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className={cn("w-full h-11", pretextGradientCtaClassName)}
        disabled={submitting || (regMode === "invite" && !inviteConfigured)}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
