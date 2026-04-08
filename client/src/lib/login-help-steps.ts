import type { TutorialStep } from "@/lib/tutorial-types";

function humanizeProvider(name: string): string {
  switch (name.toLowerCase()) {
    case "google":
      return "Google";
    case "replit":
      return "Replit";
    case "workos":
      return "WorkOS";
    default:
      return name.charAt(0).toUpperCase() + name.slice(1);
  }
}

/**
 * Build ordered login / recovery tour steps. OAuth-specific step is omitted when no SSO providers exist.
 */
export function buildLoginHelpSteps(options: { oauthProviderNames: string[] }): TutorialStep[] {
  const labels = options.oauthProviderNames.map(humanizeProvider);
  const listText =
    labels.length === 0
      ? ""
      : labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

  const steps: TutorialStep[] = [
    {
      id: "login-help-intro",
      title: "Sign-in help",
      description:
        "This short guide explains how to get into AxTask when single sign-on is unavailable or when you use email and password. It only orients you to the controls on this page—it never reads or stores your password.",
      targetId: "login-help-card",
      position: "bottom",
      glowClass: "field-glow-tutorial",
    },
  ];

  if (labels.length > 0) {
    steps.push({
      id: "login-help-oauth",
      title: "Single sign-on options",
      description: `When they are enabled on this server, you can use ${listText} to sign in with an existing identity provider. If those options are missing, dimmed, or return an error, use email and password instead.`,
      targetId: "login-help-oauth",
      position: "bottom",
      glowClass: "field-glow-hint",
    });
  }

  steps.push(
    {
      id: "login-help-password",
      title: "Email and password",
      description:
        "Choose Password or Sign in with email & password. Enter your account email and password, then submit. Passwords are not stored in the browser; only your email and provider type may be saved locally if you enabled \"Remember my login method.\"",
      targetId: "login-help-password-cta",
      position: "right",
      glowClass: "field-glow-tutorial-success",
    },
    {
      id: "login-help-forgot",
      title: "Forgot your password?",
      description:
        "On the password form, use Forgot your password. You will enter your email first. Most people receive a reset link. If you cannot use email, you may see a path using your security question when one is set on your profile.",
      targetId: "login-help-forgot-link",
      position: "top",
      glowClass: "field-glow-tutorial",
    },
    {
      id: "login-help-recovery-email",
      title: "Reset email",
      description:
        "Check your inbox and spam folder for the reset message. Links expire for your safety. You can request another reset if the link timed out.",
      position: "bottom",
    },
    {
      id: "login-help-recovery-security",
      title: "Security question path",
      description:
        "If your account has a security question, the flow may offer it after the email step. Answer the same way you did when you set it up.",
      position: "bottom",
    },
    {
      id: "login-help-recovery-admin",
      title: "Still locked out?",
      description:
        "If email and security recovery are not available or do not work, contact your workspace administrator or official support. They can verify your identity and restore access. Do not send passwords in email or chat.",
      position: "bottom",
    },
  );

  return steps;
}
