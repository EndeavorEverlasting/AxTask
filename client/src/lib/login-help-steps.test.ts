import { describe, expect, it } from "vitest";
import { buildLoginHelpSteps } from "./login-help-steps";

describe("buildLoginHelpSteps", () => {
  it("omits the OAuth step when no SSO providers are configured", () => {
    const steps = buildLoginHelpSteps({ oauthProviderNames: [] });
    expect(steps.some((s) => s.id === "login-help-oauth")).toBe(false);
    expect(steps.find((s) => s.id === "login-help-intro")).toBeDefined();
    expect(steps.find((s) => s.id === "login-help-password")).toBeDefined();
  });

  it("includes the OAuth step when providers exist", () => {
    const steps = buildLoginHelpSteps({ oauthProviderNames: ["google", "workos"] });
    const oauth = steps.find((s) => s.id === "login-help-oauth");
    expect(oauth).toBeDefined();
    expect(oauth?.description).toMatch(/Google/);
    expect(oauth?.description).toMatch(/WorkOS/);
    expect(oauth?.targetId).toBe("login-help-oauth");
  });

  it("includes recovery and admin guidance steps", () => {
    const steps = buildLoginHelpSteps({ oauthProviderNames: [] });
    expect(steps.some((s) => s.id === "login-help-forgot")).toBe(true);
    expect(steps.some((s) => s.id === "login-help-recovery-admin")).toBe(true);
    const adminStep = steps.find((s) => s.id === "login-help-recovery-admin");
    expect(adminStep?.description.toLowerCase()).toMatch(/administrator/);
  });
});
