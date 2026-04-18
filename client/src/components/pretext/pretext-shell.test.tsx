/**
 * Contract test: PretextShell mounts its orb + chip layers exactly once and
 * keeps them mounted across parent re-renders, so the cursor-repel rAF loops
 * never restart when the user navigates between routes. This is the core
 * performance guarantee behind the app-wide visual sweep.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useState } from "react";

/* The CursorOrbsBackdrop + PretextAmbientChips internals use rAF and pointer
 * listeners that are noisy in jsdom. We verify the mount contract instead of
 * their internal animation behavior (which has its own coverage). */
vi.mock("@/components/marketing/cursor-orbs-backdrop", () => ({
  CursorOrbsBackdrop: vi.fn(() => <div data-testid="orb-layer" />),
}));

vi.mock("@/components/pretext/pretext-confirmation-shell", async () => {
  const actual = await vi.importActual<typeof import("./pretext-confirmation-shell")>(
    "./pretext-confirmation-shell",
  );
  return {
    ...actual,
    PretextAmbientChips: vi.fn(({ labels }: { labels: string[] }) => (
      <div data-testid="chip-layer" data-count={labels.length} />
    )),
  };
});

import { PretextShell } from "./pretext-shell";
import { CursorOrbsBackdrop } from "@/components/marketing/cursor-orbs-backdrop";
import { PretextAmbientChips } from "./pretext-confirmation-shell";

describe("PretextShell", () => {
  it("renders aurora, orb, and chip layers", () => {
    const { getByTestId, container } = render(
      <PretextShell chips={["a", "b"]}>child</PretextShell>,
    );
    expect(container.querySelector(".axtask-aurora-body")).not.toBeNull();
    expect(getByTestId("orb-layer")).toBeTruthy();
    expect(getByTestId("chip-layer").getAttribute("data-count")).toBe("2");
  });

  it("omits chips when showChips=false", () => {
    const { queryByTestId } = render(
      <PretextShell showChips={false}>child</PretextShell>,
    );
    expect(queryByTestId("chip-layer")).toBeNull();
  });

  it("keeps orb + chip layers mounted across parent re-renders (single-mount contract)", () => {
    const backdropMock = CursorOrbsBackdrop as unknown as ReturnType<typeof vi.fn>;
    const chipsMock = PretextAmbientChips as unknown as ReturnType<typeof vi.fn>;
    backdropMock.mockClear();
    chipsMock.mockClear();

    function Host() {
      const [, setTick] = useState(0);
      /* Expose a stable setter via DOM event so we can trigger a parent
       * re-render without React Testing Library magic. */
      return (
        <PretextShell chips={["x"]}>
          <button
            type="button"
            data-testid="rerender"
            onClick={() => setTick((v) => v + 1)}
          >
            rerender
          </button>
        </PretextShell>
      );
    }

    const { getByTestId } = render(<Host />);
    const backdropMountsAfterInitial = backdropMock.mock.calls.length;
    const chipsMountsAfterInitial = chipsMock.mock.calls.length;
    expect(backdropMountsAfterInitial).toBeGreaterThanOrEqual(1);
    expect(chipsMountsAfterInitial).toBeGreaterThanOrEqual(1);

    /* Multiple parent renders; because PretextShell is memoized and its
     * props are stable, the orb/chip components must NOT be called again. */
    const button = getByTestId("rerender") as HTMLButtonElement;
    button.click();
    button.click();
    button.click();

    expect(backdropMock.mock.calls.length).toBe(backdropMountsAfterInitial);
    expect(chipsMock.mock.calls.length).toBe(chipsMountsAfterInitial);
  });

  afterEach(() => cleanup());
});
