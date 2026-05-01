import { Button } from "@/components/ui/button";

export function SsoFallbackBanner({
  onUseEmailPassword,
  onShowHelp,
}: {
  onUseEmailPassword: () => void;
  onShowHelp: () => void;
}) {
  return (
    <div
      id="login-help-sso-banner"
      className="mb-5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 px-3 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <p className="leading-snug">
        Single sign-on may be turned off or unreachable here. You can{" "}
        <strong className="font-medium">sign in with email and password</strong>, or open{" "}
        <strong className="font-medium">Help</strong> for a quick walkthrough.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-amber-100/90 text-amber-950 hover:bg-amber-200/90 dark:bg-amber-900/40 dark:text-amber-50 dark:hover:bg-amber-800/50"
          onClick={onUseEmailPassword}
        >
          Use email and password instead
        </Button>
        <button
          type="button"
          className="text-xs font-medium text-amber-800 dark:text-amber-200 underline hover:no-underline self-center"
          onClick={onShowHelp}
        >
          Show me how
        </button>
      </div>
    </div>
  );
}
