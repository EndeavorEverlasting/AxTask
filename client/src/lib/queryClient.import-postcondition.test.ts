// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, queryClient } from "./queryClient";

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("task import apiRequest postcondition", () => {
  it("accepts a clean insert without an extra task-list read", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ imported: 1, failed: 0, skippedAsDuplicate: 0, total: 1 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).resolves.toBeInstanceOf(Response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches and accepts duplicate skips only when all requested logical tasks are present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ imported: 0, failed: 0, skippedAsDuplicate: 1, total: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse([{ date: "2026-09-06", activity: "TASK A", notes: " first " }], 200),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).resolves.toBeInstanceOf(Response);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/tasks");
  });

  it("rejects a false-green duplicate and refreshes task caches when the logical task is missing", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ imported: 0, failed: 0, skippedAsDuplicate: 1, total: 1 }),
      )
      .mockResolvedValueOnce(jsonResponse([], 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).rejects.toThrow("Task import postcondition failed");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["/api/tasks"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["/api/tasks/stats"] });
  });

  it("rejects partial validation failures and refreshes caches for rows that did commit", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ imported: 1, failed: 1, skippedAsDuplicate: 0, total: 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [
          { date: "2026-09-06", activity: "Task A", notes: "First" },
          { date: "", activity: "Broken", notes: "" },
        ],
      }),
    ).rejects.toThrow("1 row(s) failed validation");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["/api/tasks"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["/api/tasks/stats"] });
  });
});