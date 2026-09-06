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
  it("accepts a clean insert without an extra verification request", async () => {
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

  it("accepts duplicate skips only after the compact owned-task presence endpoint verifies them", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ imported: 0, failed: 0, skippedAsDuplicate: 1, total: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ expectedLogicalTasks: 1, presentLogicalTasks: 1, missingLogicalTasks: 0 }, 200),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).resolves.toBeInstanceOf(Response);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/account/task-import-presence");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("rejects a false-green duplicate when owned-task presence reports a missing logical task", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ imported: 0, failed: 0, skippedAsDuplicate: 1, total: 1 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ expectedLogicalTasks: 1, presentLogicalTasks: 0, missingLogicalTasks: 1 }, 200),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).rejects.toThrow("missing from owned tasks");

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

  it.each([
    ["missing failed", { imported: 1, skippedAsDuplicate: 0, total: 1 }],
    ["string failed", { imported: 1, failed: "0", skippedAsDuplicate: 0, total: 1 }],
    ["negative failed", { imported: 1, failed: -1, skippedAsDuplicate: 1, total: 1 }],
    ["fractional skipped", { imported: 0, failed: 0, skippedAsDuplicate: 0.5, total: 1 }],
    ["inconsistent total", { imported: 1, failed: 0, skippedAsDuplicate: 0, total: 2 }],
  ])("rejects unverifiable import summaries: %s", async (_label, summary) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(summary));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).rejects.toThrow(/cannot be verified|inconsistent counts/);
  });

  it.each([
    ["missing expected", { presentLogicalTasks: 1, missingLogicalTasks: 0 }],
    ["fractional present", { expectedLogicalTasks: 1, presentLogicalTasks: 0.5, missingLogicalTasks: 0.5 }],
    ["inconsistent presence", { expectedLogicalTasks: 1, presentLogicalTasks: 1, missingLogicalTasks: 1 }],
    ["too many logical tasks", { expectedLogicalTasks: 2, presentLogicalTasks: 2, missingLogicalTasks: 0 }],
  ])("rejects unverifiable presence summaries: %s", async (_label, presence) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ imported: 0, failed: 0, skippedAsDuplicate: 1, total: 1 }),
      )
      .mockResolvedValueOnce(jsonResponse(presence, 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).rejects.toThrow(/cannot be verified|inconsistent counts/);
  });

  it("refreshes task caches after a non-OK import response because the server may have partially committed", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ message: "classification update failed" }, 500),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("POST", "/api/tasks/import", {
        tasks: [{ date: "2026-09-06", activity: "Task A", notes: "First" }],
      }),
    ).rejects.toThrow("500:");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["/api/tasks"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["/api/tasks/stats"] });
  });
});