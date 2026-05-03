// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DbSizeCard, type DbSizeReport } from "./db-size-card";

const SRC = fs.readFileSync(path.resolve(__dirname, "db-size-card.tsx"), "utf8");

describe("DbSizeCard :: source contract", () => {
  it("queries GET /api/admin/db-size", () => {
    expect(SRC).toContain("/api/admin/db-size");
  });

  it("refetches every 60 seconds (matches server-side cache TTL)", () => {
    expect(SRC).toMatch(/refetchInterval:\s*60_000/);
  });

  it("exposes testids for bytes, percentage, tone, and bar", () => {
    expect(SRC).toContain('data-testid="db-size-bytes"');
    expect(SRC).toContain('data-testid="db-size-pct"');
    expect(SRC).toContain('data-testid="db-size-tone"');
    expect(SRC).toContain('data-testid="db-size-bar"');
  });
});

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        // Mirror the real client's URL-from-queryKey default so this test
        // exercises the same fetch path as production.
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

describe("DbSizeCard :: render", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockReport(report: DbSizeReport) {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      return new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  }

  it("renders OK tone when well under budget", async () => {
    mockReport({
      bytes: 100 * 1024 * 1024,
      humanBytes: "100 MB",
      budgetBytes: 536_870_912,
      pctOfBudget: 19.5,
      tone: "ok",
      fetchedAt: "2026-04-19T01:00:00.000Z",
      source: "live",
    });

    render(
      <QueryClientProvider client={makeClient()}>
        <DbSizeCard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("db-size-bytes")).toHaveTextContent("100 MB"));
    expect(screen.getByTestId("db-size-pct")).toHaveTextContent("19.5%");
    expect(screen.getByTestId("db-size-tone")).toHaveTextContent(/OK/);
    const bar = screen.getByTestId("db-size-bar");
    expect(bar.className).toContain("bg-emerald-500");
  });

  it("renders WARN tone when between 70% and 85%", async () => {
    mockReport({
      bytes: Math.floor(536_870_912 * 0.75),
      humanBytes: "384 MB",
      budgetBytes: 536_870_912,
      pctOfBudget: 75.0,
      tone: "warn",
      fetchedAt: "2026-04-19T01:00:00.000Z",
      source: "live",
    });

    render(
      <QueryClientProvider client={makeClient()}>
        <DbSizeCard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("db-size-pct")).toHaveTextContent("75.0%"));
    expect(screen.getByTestId("db-size-tone")).toHaveTextContent(/WARN/);
    expect(screen.getByTestId("db-size-bar").className).toContain("bg-amber-500");
  });

  it("renders BAD tone when over 85% (the pre-deploy danger zone)", async () => {
    mockReport({
      bytes: Math.floor(536_870_912 * 0.92),
      humanBytes: "470 MB",
      budgetBytes: 536_870_912,
      pctOfBudget: 92.0,
      tone: "bad",
      fetchedAt: "2026-04-19T01:00:00.000Z",
      source: "cache",
    });

    render(
      <QueryClientProvider client={makeClient()}>
        <DbSizeCard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("db-size-tone")).toHaveTextContent(/BAD/));
    expect(screen.getByTestId("db-size-pct")).toHaveTextContent("92.0%");
    expect(screen.getByTestId("db-size-bar").className).toContain("bg-destructive");
  });

  it("surfaces an error row when the API is unavailable", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      return new Response("Internal error", { status: 500 });
    });

    render(
      <QueryClientProvider client={makeClient()}>
        <DbSizeCard />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/Could not read database size/i)).toBeInTheDocument(),
    );
  });
});
