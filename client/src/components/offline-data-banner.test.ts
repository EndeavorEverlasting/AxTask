import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineDataBanner } from "./offline-data-banner";
import * as network from "@/hooks/use-network-status";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-toast", () => {
  const toast = vi.fn();
  return {
    useToast: () => ({ toast, dismiss: vi.fn(), toasts: [] }),
    toast,
  };
});

describe("OfflineDataBanner", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(network, "useNetworkOnline").mockReturnValue(true);
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
    expect(screen.getByRole("button", { name: /retry sync/i })).toBeInTheDocument();
  });

  it("renders nothing when online and no stale hint", () => {
    wrap();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
