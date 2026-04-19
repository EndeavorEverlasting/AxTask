import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PerfLedger } from "@/lib/perf-ledger";
import { SurfaceResourceTable } from "./surface-resource-table";

function makeLedger() {
  return new PerfLedger({ capacity: 64, windowMs: 60_000 });
}

describe("SurfaceResourceTable", () => {
  it("shows an empty state when nothing has been reported", () => {
    const ledger = makeLedger();
    render(<SurfaceResourceTable ledger={ledger} />);
    expect(screen.getByTestId("surface-empty")).toBeInTheDocument();
  });

  it("renders rows from a ledger snapshot, sorted by totalMs by default", () => {
    const ledger = makeLedger();
    ledger.mark("alpha", "update", 2, 10);
    ledger.mark("beta", "update", 8, 30);
    ledger.mark("beta", "update", 4, 30);
    ledger.mark("gamma", "update", 6, 20);

    render(<SurfaceResourceTable ledger={ledger} />);
    expect(screen.getByTestId("surface-row-beta")).toBeInTheDocument();
    expect(screen.getByTestId("surface-row-gamma")).toBeInTheDocument();
    expect(screen.getByTestId("surface-row-alpha")).toBeInTheDocument();

    const order = screen
      .getAllByTestId(/^surface-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([
      "surface-row-beta",
      "surface-row-gamma",
      "surface-row-alpha",
    ]);
  });

  it("sorts by p95 when the p95 header is clicked", () => {
    const ledger = makeLedger();
    for (const d of [1, 1, 1, 1, 1, 20]) ledger.mark("spiky", "update", d);
    for (const d of [5, 5, 5, 5, 5, 5]) ledger.mark("steady", "update", d);

    render(<SurfaceResourceTable ledger={ledger} />);
    fireEvent.click(screen.getByTestId("sort-p95"));
    const order = screen
      .getAllByTestId(/^surface-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order[0]).toBe("surface-row-spiky");
  });

  it("Freeze toggle stops the poll and Reset clears the ledger", () => {
    const ledger = makeLedger();
    ledger.mark("alpha", "update", 5);
    render(<SurfaceResourceTable ledger={ledger} />);
    expect(screen.getByTestId("surface-row-alpha")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("surface-freeze-toggle"));
    });
    ledger.mark("beta", "update", 9);
    expect(screen.queryByTestId("surface-row-beta")).toBeNull();

    act(() => {
      fireEvent.click(screen.getByTestId("surface-reset"));
    });
    expect(screen.getByTestId("surface-empty")).toBeInTheDocument();
  });

  it("highlights long-task attribution when present", () => {
    const ledger = makeLedger();
    ledger.mark("task-list", "update", 2);
    ledger.mark("task-list", "longtask", 80);
    render(<SurfaceResourceTable ledger={ledger} />);
    expect(screen.getByText(/attributed/i)).toBeInTheDocument();
  });
});
