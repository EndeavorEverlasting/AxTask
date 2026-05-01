const ACCOUNTS_KEY = "axtask_known_accounts";
const LAST_KEY = "axtask_last_email";
const LAST_PROVIDER_KEY = "axtask_last_provider";
const REMEMBER_PREF_KEY = "axtask_remember_provider";

export interface KnownAccount {
  email: string;
  displayName: string;
  provider: "google" | "workos" | "replit" | "local";
  lastUsed: number;
}

export function getKnownAccounts(): KnownAccount[] {
  try {
    const raw: unknown[] = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    return raw.map((a: any) => ({ ...a, provider: a.provider || "local" }));
  } catch {
    return [];
  }
}

export function rememberAccount(
  email: string,
  displayName: string,
  provider: KnownAccount["provider"] = "local",
) {
  try {
    const accounts = getKnownAccounts().filter((a) => a.email !== email);
    accounts.unshift({ email, displayName, provider, lastUsed: Date.now() });
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
    localStorage.setItem(LAST_KEY, email);
    if (getRememberPref()) {
      localStorage.setItem(LAST_PROVIDER_KEY, provider);
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function forgetAccount(email: string) {
  try {
    const accounts = getKnownAccounts().filter((a) => a.email !== email);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    if (localStorage.getItem(LAST_KEY) === email) {
      localStorage.setItem(LAST_KEY, accounts[0]?.email || "");
      if (getRememberPref()) {
        if (accounts[0]) {
          localStorage.setItem(LAST_PROVIDER_KEY, accounts[0].provider);
        } else {
          localStorage.removeItem(LAST_PROVIDER_KEY);
        }
      }
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function getLastEmail(): string {
  try {
    return localStorage.getItem(LAST_KEY) || "";
  } catch {
    return "";
  }
}

export function getLastProvider(): string {
  try {
    return localStorage.getItem(LAST_PROVIDER_KEY) || "";
  } catch {
    return "";
  }
}

export function getRememberPref(): boolean {
  try {
    return localStorage.getItem(REMEMBER_PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setRememberPref(val: boolean) {
  try {
    localStorage.setItem(REMEMBER_PREF_KEY, val ? "true" : "false");
    if (!val) {
      localStorage.removeItem(LAST_PROVIDER_KEY);
    }
  } catch {
    /* ignore */
  }
}
