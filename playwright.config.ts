import { defineConfig, devices } from "@playwright/test";

/**
 * `webServer` auto-boots the built app at http://localhost:5000 for specs
 * that need real navigation (e.g. auth-confirmation-surfaces.spec.ts).
 *
 * The existing planner-scroll-visibility.spec.ts uses `page.setContent` and
 * does not care about baseURL — adding `webServer` is a no-op for it.
 *
 * Opt-out paths:
 *   - `SKIP_PLAYWRIGHT_WEBSERVER=1` — skip auto-boot entirely (useful when
 *     you already have `npm run dev` or `npm run start:app` running in
 *     another terminal).
 *   - Specs that use `page.setContent` don't hit baseURL, so the webServer
 *     will just idle and not affect them.
 */
export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.SKIP_PLAYWRIGHT_WEBSERVER
    ? undefined
    : {
        command: "npm run start:app",
        url: "http://localhost:5000/",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
        /* Production defaults REGISTRATION_MODE to invite without env — hides register UI.
         * Force open so auth-confirmation-surfaces.spec.ts can assert the register form. */
        env: { ...process.env, REGISTRATION_MODE: "open" },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
