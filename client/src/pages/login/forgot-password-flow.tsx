import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, HelpCircle, ShieldQuestion, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type ForgotStep = "email" | "method" | "security" | "reset" | "done";

export function ForgotPasswordFlow({
  forgotStep,
  email,
  setEmail,
  error,
  submitting,
  onSubmitEmail,
  onFetchSecurityQuestion,
  securityQuestion,
  securityAnswer,
  setSecurityAnswer,
  onVerifySecurityAnswer,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  onResetPassword,
  successMessage,
  onBackToSignIn,
}: {
  forgotStep: ForgotStep;
  email: string;
  setEmail: (v: string) => void;
  error: string;
  submitting: boolean;
  onSubmitEmail: (e: React.FormEvent) => void;
  onFetchSecurityQuestion: () => void;
  securityQuestion: string;
  securityAnswer: string;
  setSecurityAnswer: (v: string) => void;
  onVerifySecurityAnswer: (e: React.FormEvent) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  onResetPassword: (e: React.FormEvent) => void;
  successMessage: string;
  onBackToSignIn: () => void;
}) {
  return (
    <div className="space-y-4">
      {forgotStep === "email" && (
        <form onSubmit={onSubmitEmail} className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter the email address associated with your account.
          </p>
          <div>
            <Label htmlFor="forgotEmail">Email</Label>
            <Input
              id="forgotEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              {error}
            </p>
          )}
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
            Don&apos;t have access to your email? Try your security question instead:
          </p>
          <Button variant="outline" className="w-full" onClick={onFetchSecurityQuestion} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <ShieldQuestion className="mr-2 h-4 w-4" /> Answer security question
          </Button>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              {error}
            </p>
          )}
        </div>
      )}

      {forgotStep === "security" && (
        <form onSubmit={onVerifySecurityAnswer} className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <HelpCircle className="h-4 w-4" /> Security Question
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">{securityQuestion}</p>
          </div>
          <div>
            <Label htmlFor="secAnswer">Your Answer</Label>
            <Input
              id="secAnswer"
              type="text"
              required
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              placeholder="Type your answer…"
              className="mt-1"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>
        </form>
      )}

      {forgotStep === "reset" && (
        <form onSubmit={onResetPassword} className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Enter your new password below.</p>
          <div>
            <Label htmlFor="newPw">New Password</Label>
            <Input
              id="newPw"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, A-z, 0-9, !@#"
              className="mt-1"
            />
            {newPassword.length > 0 && (
              <div className="mt-3">
                <ul className="text-xs space-y-1.5 ml-1 text-gray-500 dark:text-gray-400">
                  <li
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      newPassword.length >= 8 ? "text-green-600 dark:text-green-500 font-medium" : "",
                    )}
                  >
                    {newPassword.length >= 8 ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />
                    )}
                    8+ characters
                  </li>
                  <li
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      /[A-Z]/.test(newPassword) ? "text-green-600 dark:text-green-500 font-medium" : "",
                    )}
                  >
                    {/[A-Z]/.test(newPassword) ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />
                    )}
                    an uppercase letter
                  </li>
                  <li
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      /[a-z]/.test(newPassword) ? "text-green-600 dark:text-green-500 font-medium" : "",
                    )}
                  >
                    {/[a-z]/.test(newPassword) ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />
                    )}
                    a lowercase letter
                  </li>
                  <li
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      /[0-9]/.test(newPassword) ? "text-green-600 dark:text-green-500 font-medium" : "",
                    )}
                  >
                    {/[0-9]/.test(newPassword) ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />
                    )}
                    a number
                  </li>
                  <li
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      /[^A-Za-z0-9]/.test(newPassword) ? "text-green-600 dark:text-green-500 font-medium" : "",
                    )}
                  >
                    {/[^A-Za-z0-9]/.test(newPassword) ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-30" />
                    )}
                    a symbol
                  </li>
                </ul>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="confirmPw">Confirm Password</Label>
            <Input
              id="confirmPw"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              className="mt-1"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              {error}
            </p>
          )}
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
          <Button className="w-full" onClick={onBackToSignIn}>
            Back to sign in
          </Button>
        </div>
      )}

      {forgotStep !== "done" && (
        <button
          type="button"
          onClick={onBackToSignIn}
          className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-primary"
        >
          ← Back to sign in
        </button>
      )}
    </div>
  );
}
