/**
 * Contract test: usePretextSurface writes `data-surface` on the <main>
 * element without triggering a React re-render, and restores the previous
 * value (or the default) when the consumer unmounts.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { usePretextSurface, type PretextSurface } from "./use-pretext-surface";

function Consumer({ surface }: { surface: PretextSurface }) {
  usePretextSurface(surface);
  return <span data-testid="consumer" />;
}

describe("usePretextSurface", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const main = document.createElement("main");
    document.body.appendChild(main);
  });

  afterEach(() => {
    cleanup();
  });

  it("sets data-surface on the main element while mounted", () => {
    render(<Consumer surface="dense" />);
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-surface")).toBe("dense");
  });

  it("restores the default when the consumer unmounts", () => {
    const { unmount } = render(<Consumer surface="dense" />);
    unmount();
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-surface")).toBe("calm");
  });

  it("restores the previous explicit surface when a nested consumer unmounts", () => {
    const main = document.querySelector("main")!;
    main.setAttribute("data-surface", "calm");
    const outer = render(<Consumer surface="calm" />);
    const inner = render(<Consumer surface="dense" />);
    expect(main.getAttribute("data-surface")).toBe("dense");
    inner.unmount();
    expect(main.getAttribute("data-surface")).toBe("calm");
    outer.unmount();
  });

  it("is a no-op when there is no main element in the DOM", () => {
    document.body.innerHTML = "";
    expect(() => render(<Consumer surface="dense" />)).not.toThrow();
  });
});
