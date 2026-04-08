/** Shared auth/CSRF constants — must match `server/index.ts` cookie + header wiring. */

export const AUTH_ME_PATH = "/api/auth/me";
export const AUTH_LOGIN_PATH = "/api/auth/login";
export const AUTH_REGISTER_PATH = "/api/auth/register";
export const AUTH_LOGOUT_PATH = "/api/auth/logout";
export const AUTH_REFRESH_PATH = "/api/auth/refresh";

export const AXTASK_CSRF_HEADER = "x-csrf-token";
export const AXTASK_CSRF_COOKIE = "axtask.csrf";
