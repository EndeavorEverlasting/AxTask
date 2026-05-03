import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { usePerfSurface } from "./use-perf-surface";
import { PerfLedger } from "@/lib/perf-ledger";

function Surface({
  name,
  ledger,
  value,
}: {
  name: string;
  ledger: PerfLedger;
  value: number;
}) {
  const ref = usePerfSurface<HTMLDivElement>(name, { ledger });
  return (
    <div ref={ref} data-testid="surface">
      {value}
    </div>
  );
}

function Toggle({ ledger }: { ledger: PerfLedger }) {
  const [v, setV] = useState(0);
  return (
    <>
      <Surface name="toggle" ledger={ledger} value={v} />
      <button onClick={() => setV((n) => n + 1)} data-testid="bump">
        +
      </button>
    </>
  );
}

describe("usePerfSurface", () => {
  it("tags the element with data-axtask-surface and records a mount", () => {
    const ledger = new PerfLedger({ capacity: 32 });
    render(<Surface name="task-list" ledger={ledger} value={0} />);
    const el = screen.getByTestId("surface");
    expect(el.dataset.axtaskSurface).toBe("task-list");
    const snap = ledger.snapshot();
    const row = snap.rows.find((r) => r.surface === "task-list")!;
    expect(row.mounts).toBe(1);
  });

  it("records render marks for subsequent passes", async () => {
    const ledger = new PerfLedger({ capacity: 32 });
    const { rerender } = render(<Toggle ledger={ledger} />);
    rerender(<Toggle ledger={ledger} />);
    rerender(<Toggle ledger={ledger} />);
    const snap = ledger.snapshot();
    const row = snap.rows.find((r) => r.surface === "toggle")!;
    expect(row.mounts).toBe(1);
    expect(row.renders).toBeGreaterThanOrEqual(1);
  });
});
