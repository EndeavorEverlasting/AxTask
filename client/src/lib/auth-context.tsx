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
import { clearQueryPersistStorage } from "./query-persist-policy";

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token
    ? { "Content-Type": "application/json", [AXTASK_CSRF_HEADER]: token }
    : { "Content-Type": "application/json" };
}

/** Phase B: session cookie missing/expired but device refresh cookie may still work. */
async function fetchSessionUser(): Promise<SafeUser | null> {
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

interface AuthContextType {
  user: SafeUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
        if (data?.email) rememberKnownAccount(data);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
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
    const data = await res.json();
    setUser(data);
    rememberKnownAccount(data);
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
    setUser(data);
    rememberKnownAccount(data);
  }, []);

  const logout = useCallback(async () => {
    await fetch(AUTH_LOGOUT_PATH, {
      method: "POST",
      headers: csrfHeaders(),
      credentials: "include",
    });
    setUser(null);
    clearQueryPersistStorage();
    queryClient.clear();
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await fetchSessionUser();
    setUser(data);
    if (data?.email) rememberKnownAccount(data);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
