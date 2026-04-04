/**
 * Single source of truth for same-origin session auth HTTP surface.
 * Used by the Express server and the Vite client so offline (dev) and
 * Docker/production builds stay aligned.
 */
export const AXTASK_CSRF_COOKIE = "axtask.csrf";
export const AXTASK_CSRF_HEADER = "x-csrf-token";

export const AUTH_ME_PATH = "/api/auth/me";
export const AUTH_LOGIN_PATH = "/api/auth/login";
export const AUTH_REGISTER_PATH = "/api/auth/register";
export const AUTH_LOGOUT_PATH = "/api/auth/logout";
/** Phase B: re-establish Passport session using httpOnly device refresh cookie. */
export const AUTH_REFRESH_PATH = "/api/auth/refresh";
