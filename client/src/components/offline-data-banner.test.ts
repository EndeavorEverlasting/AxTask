import { createElement } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineDataBanner } from "./offline-data-banner";
import * as network from "@/hooks/use-network-status";
import { STALE_DATA_WARNING_AFTER_MS } from "@/lib/query-persist-policy";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-toast", () => {
  const toast = vi.fn();
  return {
    useToast: () => ({ toast, dismiss: vi.fn(), toasts: [] }),
    toast,
  };
});

function seedStalePersistedQuery(client: QueryClient): void {
  const queryKey = ["/api/tasks"] as const;
  client.setQueryData(queryKey, { id: 1 });
  const query = client.getQueryCache().find({ queryKey });
  expect(query).toBeDefined();
  query!.setState({
    dataUpdatedAt: Date.now() - STALE_DATA_WARNING_AFTER_MS - 60_000,
    // No observers in this test: Query.isStale() is false unless invalidated.
    isInvalidated: true,
  });
}

describe("OfflineDataBanner", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(network, "useNetworkOnline").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function wrap() {
    return render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(OfflineDataBanner),
        createElement(Toaster),
      ),
    );
  }

  it("renders offline messaging when useNetworkOnline is false", () => {
    vi.spyOn(network, "useNetworkOnline").mockReturnValue(false);
    wrap();
    expect(screen.getByRole("alert")).toHaveTextContent(/offline/i);
    expect(screen.getByRole("button", { name: /sync when online/i })).toBeInTheDocument();
  });

  it("renders nothing when online and no stale hint", () => {
    wrap();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows refreshing state and calls invalidateQueries when Refresh now is clicked", async () => {
    seedStalePersistedQuery(queryClient);
    let resolveInvalidate: () => void = () => {};
    const invalidatePromise = new Promise<void>((resolve) => {
      resolveInvalidate = resolve;
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValue(invalidatePromise as unknown as ReturnType<QueryClient["invalidateQueries"]>);

    wrap();

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/Some cached data hasn/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /refresh now/i }));
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /refreshing/i })).toBeDisabled();
    expect(screen.getByText(/Refreshing data from the server/)).toBeInTheDocument();

    await act(async () => {
      resolveInvalidate();
      await invalidatePromise;
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /refresh now/i })).not.toBeDisabled();
    });

    invalidateSpy.mockRestore();
  });
});
