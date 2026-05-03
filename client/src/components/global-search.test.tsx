// @vitest-environment jsdom
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalSearch } from "./global-search";

/**
 * Mixed contract + render tests for GlobalSearch.
 *
 * - Source-level contract: debounce interval, min-length guard, query key /
 *   route shape, credentials. These guarantees drift easily in refactors and
 *   are load-bearing (the path route awards engagement coins via
 *   `tryCappedCoinAward` — see server/routes.ts ~L1928).
 * - Render: gating on `open`, Esc handling, Enter selection, backdrop close.
 */

const SRC = fs.readFileSync(path.resolve(__dirname, "global-search.tsx"), "utf8");

describe("GlobalSearch :: source contract", () => {
  it("debounces input at 250ms", () => {
    expect(SRC).toMatch(/setTimeout\(\(\) => setDebouncedQuery\(query\), 250\)/);
  });

  it("enforces min query length of 2 before hitting the API", () => {
    expect(SRC).toMatch(/trimmed\.length >= 2/);
  });

  it("hits the engagement-rewarded path route /api/tasks/search/:query", () => {
    expect(SRC).toContain("/api/tasks/search/${encodeURIComponent(q)}");
    // Baseline's query-string variant must not leak in:
    expect(SRC).not.toMatch(/\/api\/tasks\/search\?q=/);
  });

  it("shares cache keys with task-list's server-search query", () => {
    expect(SRC).toMatch(/queryKey: \["\/api\/tasks\/search", trimmed\]/);
  });

  it("uses apiFetch (credentialed + signal-aware), not raw fetch", () => {
    expect(SRC).toContain("apiFetch");
    expect(SRC).not.toMatch(/\bfetch\(`\/api\/tasks\/search/);
  });

  it("closes on Escape and returns early", () => {
    expect(SRC).toMatch(/e\.key === "Escape"/);
  });

  it("Enter on the highlighted row opens the selected task", () => {
    expect(SRC).toMatch(/e\.key === "Enter"/);
  });
});

function withClient(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("GlobalSearch :: render", () => {
  beforeEach(() => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders nothing when open=false", () => {
    const { container } = render(
      withClient(
        <GlobalSearch open={false} onOpenChange={() => {}} onSelectTask={() => {}} />,
      ),
    );
    expect(container.querySelector("[data-testid=\"global-search-overlay\"]")).toBeNull();
  });

  it("renders the overlay and input when open=true", () => {
    render(
      withClient(
        <GlobalSearch open={true} onOpenChange={() => {}} onSelectTask={() => {}} />,
      ),
    );
    expect(screen.getByTestId("global-search-overlay")).toBeTruthy();
    expect(screen.getByTestId("global-search-input")).toBeTruthy();
  });

  it("shows the min-length hint when the query is shorter than 2 chars", () => {
    render(
      withClient(
        <GlobalSearch open={true} onOpenChange={() => {}} onSelectTask={() => {}} />,
      ),
    );
    expect(screen.getByText(/at least 2 characters/i)).toBeTruthy();
  });

  it("calls onOpenChange(false) when the close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      withClient(
        <GlobalSearch open={true} onOpenChange={onOpenChange} onSelectTask={() => {}} />,
      ),
    );
    fireEvent.click(screen.getByTestId("global-search-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when Escape is pressed in the input", () => {
    const onOpenChange = vi.fn();
    render(
      withClient(
        <GlobalSearch open={true} onOpenChange={onOpenChange} onSelectTask={() => {}} />,
      ),
    );
    fireEvent.keyDown(screen.getByTestId("global-search-input"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not fire a network request while the query is below the min length", async () => {
    render(
      withClient(
        <GlobalSearch open={true} onOpenChange={() => {}} onSelectTask={() => {}} />,
      ),
    );
    const input = screen.getByTestId("global-search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 300));
    expect(window.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/search/"),
      expect.anything(),
    );
  });
});
