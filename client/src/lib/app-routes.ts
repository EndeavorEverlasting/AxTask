/**
 * Known in-app paths (no host, no hash). Keep in sync with `<Router>` in App.tsx.
 * Used for last-route persistence and post-login `?next=` validation.
 */
export const VALID_APP_PATHS = [
  "/",
  "/tasks",
  "/calendar",
  "/analytics",
  "/import-export",
  "/google-sheets",
  "/checklist",
  "/planner",
  "/mini-games",
  "/feedback",
  "/community",
  "/admin",
  "/rewards",
  "/premium",
  "/billing",
  "/account",
  "/appeals",
  "/contact",
  "/billing-bridge",
] as const;

export type ValidAppPath = (typeof VALID_APP_PATHS)[number];

export function isValidAppPath(path: string): path is ValidAppPath {
  return (VALID_APP_PATHS as readonly string[]).includes(path);
}
