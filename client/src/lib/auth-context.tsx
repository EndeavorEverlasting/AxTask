import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { SafeUser } from "@shared/schema";
import {
  AUTH_LOGIN_PATH,
  AUTH_LOGOUT_PATH,
  AUTH_ME_PATH,
  AUTH_REFRESH_PATH,
  AUTH_REGISTER_PATH,
  AXTASK_CSRF_HEADER,
} from "@shared/http-auth";
import { queryClient, getCsrfToken } from "./queryClient";
import { clearPersistOnLogout, clearQueryPersistStorageForUser } from "./query-persist-policy";
import { clearOfflineTaskQueue, setOfflineQueueUserScope } from "./offline-task-queue";

/** Must match `ROUTE_STORAGE_KEY` in `App.tsx` (last visited route for restore). */
const ROUTE_STORAGE_KEY = "axtask_last_route";

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token
    ? { "Content-Type": "application/json", [AXTASK_CSRF_HEADER]: token }
    : { "Content-Type": "application/json" };
}

/** Phase B: session cookie missing/expired but device refresh cookie may still work. */
async function fetchSessionUser(): Promise<SafeUser | null> {
  try {
    let res = await fetch(AUTH_ME_PATH, { credentials: "include" });
    if (res.ok) return res.json();
    if (res.status === 401) {
      const r2 = await fetch(AUTH_REFRESH_PATH, {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (r2.ok) return r2.json();
    }
    return null;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[auth] fetchSessionUser failed:", e);
    }
    return null;
  }
}

function rememberKnownAccount(data: SafeUser): void {
  try {
    const ACCOUNTS_KEY = "axtask_known_accounts";
    const LAST_KEY = "axtask_last_email";
    const LAST_PROVIDER_KEY = "axtask_last_provider";
    const REMEMBER_PREF_KEY = "axtask_remember_provider";
    const provider = data.authProvider || "local";
    const existing = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]")
      .filter((a: { email: string }) => a.email !== data.email);
    existing.unshift({
      email: data.email,
      displayName: data.displayName || data.email.split("@")[0],
      provider,
      lastUsed: Date.now(),
    });
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(existing.slice(0, 5)));
    localStorage.setItem(LAST_KEY, data.email);
    if (localStorage.getItem(REMEMBER_PREF_KEY) !== "false") {
      localStorage.setItem(LAST_PROVIDER_KEY, provider);
    }
  } catch {
    /* localStorage may be unavailable */
  }
}

export type LoginOutcome =
  | { status: "authenticated"; user: SafeUser }
  | { status: "totp_required"; emailMask?: string };

interface AuthContextType {
  user: SafeUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  /** Complete sign-in after password step when `login` returned `totp_required`. */
  completeTotpLogin: (code: string) => Promise<SafeUser>;
  register: (email: string, password: string, displayName?: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Reload session user from GET /api/auth/me (e.g. after phone verification). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSessionUser();
        if (cancelled) return;
        setUser(data);
        setOfflineQueueUserScope(data?.id ?? null);
        if (data?.email) rememberKnownAccount(data);
      } catch {
        if (!cancelled) {
          setUser(null);
          setOfflineQueueUserScope(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginOutcome> => {
    const res = await fetch(AUTH_LOGIN_PATH, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Login failed");
    }
    const data = (await res.json()) as { needsTotp?: boolean; emailMask?: string } & Partial<SafeUser>;
    if (data.needsTotp) {
      return { status: "totp_required", emailMask: data.emailMask };
    }
    const user = data as SafeUser;
    clearQueryPersistStorageForUser(null);
    setUser(user);
    setOfflineQueueUserScope(user?.id ?? null);
    rememberKnownAccount(user);
    return { status: "authenticated", user };
  }, []);

  const completeTotpLogin = useCallback(async (code: string) => {
    const res = await fetch("/api/auth/totp/verify", {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || "Verification failed");
    }
    const user = (await res.json()) as SafeUser;
    clearQueryPersistStorageForUser(null);
    setUser(user);
    setOfflineQueueUserScope(user?.id ?? null);
    rememberKnownAccount(user);
    return user;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string, inviteCode?: string) => {
    const res = await fetch(AUTH_REGISTER_PATH, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
      body: JSON.stringify({ email, password, displayName, inviteCode }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Registration failed");
    }
    const data = await res.json();
    clearQueryPersistStorageForUser(null);
    setUser(data);
    setOfflineQueueUserScope(data?.id ?? null);
    rememberKnownAccount(data);
  }, []);

  const logout = useCallback(async () => {
    const uid = user?.id ?? null;
    await fetch(AUTH_LOGOUT_PATH, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
    });
    setUser(null);
    setOfflineQueueUserScope(null);
    clearPersistOnLogout(uid);
    try {
      localStorage.removeItem(ROUTE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    clearOfflineTaskQueue();
    queryClient.clear();
  }, [user?.id]);

  const refreshUser = useCallback(async () => {
    const data = await fetchSessionUser();
    setUser(data);
    setOfflineQueueUserScope(data?.id ?? null);
    if (data?.email) rememberKnownAccount(data);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, completeTotpLogin, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
