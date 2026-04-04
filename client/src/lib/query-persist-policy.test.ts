import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clearQueryPersistStorage,
  isPersistableQueryKey,
  queryKeyRootString,
  QUERY_PERSIST_STORAGE_KEY,
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

  describe("isPersistableQueryKey", () => {
    it("excludes auth, admin, and billing API roots", () => {
      expect(isPersistableQueryKey(["/api/auth/me"])).toBe(false);
      expect(isPersistableQueryKey(["/api/auth/config"])).toBe(false);
      expect(isPersistableQueryKey(["/api/admin/users"])).toBe(false);
      expect(isPersistableQueryKey(["/api/billing/payment-methods"])).toBe(false);
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

  describe("clearQueryPersistStorage", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      localStorage.clear();
    });

    it("removes the persist key", () => {
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
});
