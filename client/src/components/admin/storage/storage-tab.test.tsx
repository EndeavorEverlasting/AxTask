// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { StorageTab } from "./storage-tab";
import type {
  PublicDbStorageDomainsResponse,
  PublicDbStorageTablesResponse,
  PublicDbStorageTopUsersResponse,
  PublicDbSizeHistoryResponse,
  PublicRetentionPreviewResponse,
} from "@shared/public-client-dtos";

/**
 * Hermetic test harness: every fetch is intercepted and routed to a
 * fixture based on URL. No MSW dependency required — pure vi.fn over
 * globalThis.fetch, same pattern as db-size-card.test.tsx.
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchInterval: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch(queryKey.join("/") as string, { credentials: "include" });
          if (!res.ok) {
            const text = (await res.text()) || res.statusText;
            throw new Error(`${res.status}: ${text}`);
          }
          return res.json();
        },
      },
    },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StorageTab", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.startsWith("/api/admin/db-size/history")) {
        const body: PublicDbSizeHistoryResponse = {
          days: 30,
          points: [
            { capturedAt: "2026-04-10T00:00:00.000Z", dbSizeBytes: 500 * 1024 * 1024, domainBytes: { core: 100, tasks: 200, gamification: 0, ops: 200 * 1024 * 1024, unknown: 0 } },
            { capturedAt: "2026-04-18T00:00:00.000Z", dbSizeBytes: 600 * 1024 * 1024, domainBytes: { core: 120, tasks: 260, gamification: 0, ops: 220 * 1024 * 1024, unknown: 0 } },
          ],
        };
        return jsonResponse(body);
      }

      if (url.startsWith("/api/admin/db-size")) {
        return jsonResponse({
          bytes: 600 * 1024 * 1024,
          humanBytes: "600 MB",
          budgetBytes: 10 * 1024 * 1024 * 1024,
          pctOfBudget: 5.9,
          tone: "ok",
          fetchedAt: "2026-04-19T00:00:00.000Z",
          source: "live",
        });
      }

      if (url.startsWith("/api/admin/db-storage/tables")) {
        const body: PublicDbStorageTablesResponse = {
          source: "live",
          fetchedAt: "2026-04-19T00:00:00.000Z",
          rows: [
            { tableName: "security_events", domain: "core", totalBytes: 200 * 1024 * 1024, tableBytes: 180 * 1024 * 1024, indexBytes: 20 * 1024 * 1024, toastBytes: 0, liveRows: 1_000_000, deadRows: 50 },
            { tableName: "tasks", domain: "tasks", totalBytes: 100 * 1024 * 1024, tableBytes: 80 * 1024 * 1024, indexBytes: 20 * 1024 * 1024, toastBytes: 0, liveRows: 200_000, deadRows: 10 },
          ],
        };
        return jsonResponse(body);
      }

      if (url.startsWith("/api/admin/db-storage/domains")) {
        const body: PublicDbStorageDomainsResponse = {
          source: "live",
          fetchedAt: "2026-04-19T00:00:00.000Z",
          rollup: [
            { domain: "core", tableCount: 5, totalBytes: 200 * 1024 * 1024, tableBytes: 180 * 1024 * 1024, indexBytes: 20 * 1024 * 1024, liveRows: 1_000_000 },
            { domain: "tasks", tableCount: 3, totalBytes: 100 * 1024 * 1024, tableBytes: 80 * 1024 * 1024, indexBytes: 20 * 1024 * 1024, liveRows: 200_000 },
            { domain: "gamification", tableCount: 2, totalBytes: 10 * 1024 * 1024, tableBytes: 9 * 1024 * 1024, indexBytes: 1 * 1024 * 1024, liveRows: 1000 },
            { domain: "ops", tableCount: 10, totalBytes: 40 * 1024 * 1024, tableBytes: 35 * 1024 * 1024, indexBytes: 5 * 1024 * 1024, liveRows: 5000 },
            { domain: "unknown", tableCount: 0, totalBytes: 0, tableBytes: 0, indexBytes: 0, liveRows: 0 },
          ],
        };
        return jsonResponse(body);
      }

      if (url.startsWith("/api/admin/db-storage/top-users")) {
        const kind = url.includes("kind=tasks") ? "tasks" : "attachments";
        const body: PublicDbStorageTopUsersResponse = {
          kind,
          fetchedAt: "2026-04-19T00:00:00.000Z",
          rows: [
            { userKey: "abc1234567", bytes: 50 * 1024 * 1024, rowCount: 100 },
            { userKey: "def2345678", bytes: 25 * 1024 * 1024, rowCount: 40 },
          ],
        };
        return jsonResponse(body);
      }

      if (url.startsWith("/api/admin/retention/preview")) {
        const body: PublicRetentionPreviewResponse = {
          generatedAt: "2026-04-19T00:00:00.000Z",
          totalRowsToDelete: 150,
          rows: [
            { table: "security_events", cutoff: "2026-03-20T00:00:00.000Z", rowsToDelete: 100 },
            { table: "security_logs", cutoff: "2026-03-20T00:00:00.000Z", rowsToDelete: 30 },
            { table: "usage_snapshots", cutoff: "2026-02-18T00:00:00.000Z", rowsToDelete: 15 },
            { table: "password_reset_tokens", cutoff: "2026-04-12T00:00:00.000Z", rowsToDelete: 3 },
            { table: "db_size_snapshots", cutoff: "2025-04-19T00:00:00.000Z", rowsToDelete: 2 },
          ],
        };
        return jsonResponse(body);
      }

      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the five storage cards (size, trend, domain, table, users × 2, prune)", async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <StorageTab />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("db-size-card")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("db-size-trend-card")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("per-domain-rollup")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("per-table-breakdown")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("top-users-attachments")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("top-users-tasks")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("retention-prune-actions")).toBeInTheDocument());
  });

  it("shows only hashed keys for top users (never raw userIds)", async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <StorageTab />
      </QueryClientProvider>,
    );

    const attachments = await screen.findByTestId("top-users-attachments");
    // The card mounts immediately with "Loading…"; wait for the first key row.
    await waitFor(() =>
      expect(within(attachments).getAllByTestId(/^top-users-attachments-key-/).length).toBeGreaterThan(0),
    );
    const keys = within(attachments).getAllByTestId(/^top-users-attachments-key-/);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      // Our fixture uses short hex-like keys; assert none look like a
      // UUID v4 or an email (the two shapes that'd indicate a raw ID).
      expect(k.textContent).not.toMatch(/@/);
      expect(k.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it("renders a sortable per-table table with the domain filter pills", async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <StorageTab />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("per-table-table")).toBeInTheDocument());
    const rows = screen.getAllByTestId(/^per-table-row-/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Filter pills are present for every domain.
    for (const domain of ["all", "core", "tasks", "gamification", "ops", "unknown"]) {
      expect(screen.getByTestId(`per-table-filter-${domain}`)).toBeInTheDocument();
    }
  });

  it("renders the retention preview rows and the Run prune button (no accidental auto-run)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    render(
      <QueryClientProvider client={makeClient()}>
        <StorageTab />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("retention-preview-table")).toBeInTheDocument(),
    );
    const runBtn = screen.getByTestId("retention-run-button");
    expect(runBtn).toBeInTheDocument();
    // Mounting must never POST /retention/run on its own.
    const runCalls = fetchMock.mock.calls.filter((call) => {
      const url = typeof call[0] === "string" ? call[0] : String(call[0]);
      const init = call[1] as RequestInit | undefined;
      return url.includes("/api/admin/retention/run") && init?.method === "POST";
    });
    expect(runCalls.length).toBe(0);
  });
});
