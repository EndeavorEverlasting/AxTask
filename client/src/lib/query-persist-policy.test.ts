import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearPersistOnLogout,
  clearQueryPersistStorage,
  clearQueryPersistStorageForUser,
  getQueryPersistStorageKeyForUser,
  isPersistableQueryKey,
  migrateLegacyQueryPersistStorageOnce,
  queryKeyRootString,
  QUERY_PERSIST_LEGACY_GLOBAL_KEY,
  QUERY_PERSIST_MAX_SERIALIZED_BYTES,
  QUERY_PERSIST_STORAGE_KEY,
  serializePersistedClientWithSizeCap,
  shouldDehydrateQueryForPersist,
} from "./query-persist-policy";

describe("query-persist-policy", () => {
  describe("queryKeyRootString", () => {
    it("returns first string segment", () => {
      expect(queryKeyRootString(["/api/tasks", "x"])).toBe("/api/tasks");
    });
    it("returns null when first segment is not a string", () => {
      expect(queryKeyRootString([1, "x"])).toBeNull();
    });
  });

  describe("getQueryPersistStorageKeyForUser", () => {
    it("uses anon suffix for null or empty id", () => {
      expect(getQueryPersistStorageKeyForUser(null)).toBe("axtask.react-query.v1.u.anon");
      expect(getQueryPersistStorageKeyForUser(undefined)).toBe("axtask.react-query.v1.u.anon");
      expect(getQueryPersistStorageKeyForUser("")).toBe("axtask.react-query.v1.u.anon");
    });
    it("sanitizes user id for the key", () => {
      expect(getQueryPersistStorageKeyForUser("user/1")).toBe("axtask.react-query.v1.u.user_1");
    });
  });

  describe("isPersistableQueryKey", () => {
    it("excludes auth, admin, billing, invoices, premium, notifications, storage API roots", () => {
      expect(isPersistableQueryKey(["/api/auth/me"])).toBe(false);
      expect(isPersistableQueryKey(["/api/auth/config"])).toBe(false);
      expect(isPersistableQueryKey(["/api/admin/users"])).toBe(false);
      expect(isPersistableQueryKey(["/api/billing/payment-methods"])).toBe(false);
      expect(isPersistableQueryKey(["/api/invoices/abc"])).toBe(false);
      expect(isPersistableQueryKey(["/api/premium/status"])).toBe(false);
      expect(isPersistableQueryKey(["/api/notifications/list"])).toBe(false);
      expect(isPersistableQueryKey(["/api/storage/upload"])).toBe(false);
    });
    it("allows tasks, planner, and gamification", () => {
      expect(isPersistableQueryKey(["/api/tasks"])).toBe(true);
      expect(isPersistableQueryKey(["/api/planner/briefing"])).toBe(true);
      expect(isPersistableQueryKey(["/api/gamification/wallet"])).toBe(true);
    });
    it("rejects unknown key shapes (no string root)", () => {
      expect(isPersistableQueryKey([])).toBe(false);
      expect(isPersistableQueryKey([null])).toBe(false);
    });
  });

  describe("shouldDehydrateQueryForPersist", () => {
    it("returns false for sensitive keys without calling default dehydrate", () => {
      const q = {
        queryKey: ["/api/auth/me"],
        state: { status: "success", fetchStatus: "idle", data: {} },
      };
      expect(shouldDehydrateQueryForPersist(q as any)).toBe(false);
    });
  });

  describe("serializePersistedClientWithSizeCap", () => {
    it("drops queries when payload would exceed cap", () => {
      const huge = "x".repeat(QUERY_PERSIST_MAX_SERIALIZED_BYTES);
      const client = {
        timestamp: 1,
        buster: "v1",
        clientState: {
          mutations: [],
          queries: [{ queryKey: ["/api/tasks"], state: { data: huge } }],
        },
      };
      const s = serializePersistedClientWithSizeCap(client as any);
      expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(QUERY_PERSIST_MAX_SERIALIZED_BYTES);
      const parsed = JSON.parse(s);
      expect(parsed.clientState.queries).toEqual([]);
    });
  });

  describe("clearQueryPersistStorage", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      localStorage.clear();
    });

    it("removes the legacy global persist key", () => {
      localStorage.setItem(QUERY_PERSIST_STORAGE_KEY, "{}");
      clearQueryPersistStorage();
      expect(localStorage.getItem(QUERY_PERSIST_STORAGE_KEY)).toBeNull();
    });

    it("does not throw when storage throws", () => {
      const rm = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => clearQueryPersistStorage()).not.toThrow();
      rm.mockRestore();
    });
  });

  describe("clearQueryPersistStorageForUser", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      localStorage.clear();
    });

    it("removes the per-user key", () => {
      const key = getQueryPersistStorageKeyForUser("u1");
      localStorage.setItem(key, "{}");
      clearQueryPersistStorageForUser("u1");
      expect(localStorage.getItem(key)).toBeNull();
    });
  });

  describe("clearPersistOnLogout", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      localStorage.clear();
    });

    it("clears legacy, user bucket, and anon bucket", () => {
      localStorage.setItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY, "{}");
      localStorage.setItem(getQueryPersistStorageKeyForUser("u1"), "{}");
      localStorage.setItem(getQueryPersistStorageKeyForUser(null), "{}");
      clearPersistOnLogout("u1");
      expect(localStorage.getItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY)).toBeNull();
      expect(localStorage.getItem(getQueryPersistStorageKeyForUser("u1"))).toBeNull();
      expect(localStorage.getItem(getQueryPersistStorageKeyForUser(null))).toBeNull();
    });
  });

  describe("migrateLegacyQueryPersistStorageOnce", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      localStorage.clear();
    });

    it("removes legacy key once and sets flag", () => {
      localStorage.setItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY, "{}");
      migrateLegacyQueryPersistStorageOnce();
      expect(localStorage.getItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY)).toBeNull();
      expect(localStorage.getItem("axtask.react-query.migrated-legacy-v1")).toBe("1");
      localStorage.setItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY, "{}");
      migrateLegacyQueryPersistStorageOnce();
      expect(localStorage.getItem(QUERY_PERSIST_LEGACY_GLOBAL_KEY)).toBe("{}");
    });
  });
});
