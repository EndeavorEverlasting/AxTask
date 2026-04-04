import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetworkOnline } from "./use-network-status";

describe("useNetworkOnline", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reflects navigator.onLine", () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const { result } = renderHook(() => useNetworkOnline());
    expect(result.current).toBe(false);
  });

  it("updates on window online/offline events", () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
    const { result } = renderHook(() => useNetworkOnline());
    expect(result.current).toBe(true);

    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    vi.stubGlobal("navigator", { ...navigator, onLine: true });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
