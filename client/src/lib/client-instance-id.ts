const STORAGE_KEY = "axtask_client_instance_id_v1";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value);
}

/**
 * Stable per-browser-profile id for optional `x-axtask-client-instance` header.
 * Not a secret; server stores HMAC only. See docs/BROWSER_BOUND_SIGNALS.md.
 */
export function getClientInstanceId(): string {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    return "00000000-0000-4000-8000-000000000000";
  }
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id || !isUuidV4(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    try {
      let id = sessionStorage.getItem(STORAGE_KEY);
      if (!id || !isUuidV4(id)) {
        id = crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch {
      return "00000000-0000-4000-8000-000000000001";
    }
  }
}
