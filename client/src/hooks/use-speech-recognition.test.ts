import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  _started = false;

  start() {
    this._started = true;
    setTimeout(() => this.onstart?.(), 0);
  }

  stop() {
    this._started = false;
    setTimeout(() => this.onend?.(), 0);
  }

  simulateResult(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: {
          isFinal,
          length: 1,
          0: { transcript, confidence: 0.95 },
        },
      },
    });
  }

  simulateError(error: string) {
    this.onerror?.({ error, message: `Error: ${error}` });
  }
}

let mockInstance: MockSpeechRecognition | null = null;

function makeMockConstructor() {
  return class extends MockSpeechRecognition {
    constructor() {
      super();
      mockInstance = this;
    }
  };
}

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInstance = null;
    (window as any).SpeechRecognition = makeMockConstructor();
  });

  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    mockInstance = null;
    vi.useRealTimers();
    vi.resetModules();
  });

  async function loadHook() {
    const mod = await import("./use-speech-recognition");
    return mod.useSpeechRecognition;
  }

  it("reports isSupported=true when SpeechRecognition API exists", async () => {
    const useSpeechRecognition = await loadHook();
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  it("reports isSupported=true with webkit prefix", async () => {
    delete (window as any).SpeechRecognition;
    (window as any).webkitSpeechRecognition = makeMockConstructor();
    const useSpeechRecognition = await loadHook();
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  it("starts in idle status", async () => {
    const useSpeechRecognition = await loadHook();
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.status).toBe("idle");
    expect(result.current.transcript).toBe("");
    expect(result.current.interimTranscript).toBe("");
    expect(result.current.error).toBeNull();
  });

  describe("start/stop lifecycle", () => {
    it("transitions to listening on start", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      expect(mockInstance).not.toBeNull();

      await act(async () => { vi.advanceTimersByTime(10); });
      expect(result.current.status).toBe("listening");
    });

    it("transitions back to idle on stop", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });
      expect(result.current.status).toBe("listening");

      act(() => result.current.stop());
      expect(result.current.status).toBe("idle");
    });

    it("toggle starts when idle", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.toggle());
      await act(async () => { vi.advanceTimersByTime(10); });
      expect(result.current.status).toBe("listening");
    });

    it("toggle stops when listening", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => result.current.toggle());
      expect(result.current.status).toBe("idle");
    });
  });

  describe("transcript assembly", () => {
    it("appends final transcript results", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateResult("hello world", true));
      expect(result.current.transcript).toContain("hello world");
    });

    it("tracks interim transcript separately", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateResult("hel", false));
      expect(result.current.interimTranscript).toBe("hel");
      expect(result.current.transcript).toBe("");
    });

    it("concatenates multiple final results", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateResult("hello", true));
      act(() => mockInstance!.simulateResult("world", true));
      expect(result.current.transcript).toContain("hello");
      expect(result.current.transcript).toContain("world");
    });

    it("clears interim transcript after final result", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateResult("hell", false));
      expect(result.current.interimTranscript).toBe("hell");

      act(() => mockInstance!.simulateResult("hello world", true));
      expect(result.current.interimTranscript).toBe("");
    });
  });

  describe("resetTranscript", () => {
    it("clears both transcript and interim", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateResult("hello", true));
      expect(result.current.transcript).toContain("hello");

      act(() => result.current.resetTranscript());
      expect(result.current.transcript).toBe("");
      expect(result.current.interimTranscript).toBe("");
    });
  });

  describe("error handling", () => {
    it("sets error for not-allowed", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateError("not-allowed"));
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Microphone permission");
    });

    it("sets error for no-speech", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateError("no-speech"));
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("No speech");
    });

    it("sets error for audio-capture", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateError("audio-capture"));
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("microphone");
    });

    it("sets error for network", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateError("network"));
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("network");
    });

    it("ignores aborted errors silently", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateError("aborted"));
      expect(result.current.status).toBe("listening");
      expect(result.current.error).toBeNull();
    });

    it("sets generic error for unknown error codes", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateError("something-weird"));
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("something-weird");
    });
  });

  describe("callbacks", () => {
    it("calls onResult with trimmed final transcript", async () => {
      const onResult = vi.fn();
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition({ onResult }));

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.simulateResult("  hello world  ", true));
      expect(onResult).toHaveBeenCalledWith("hello world");
    });

    it("calls onEnd when recognition ends", async () => {
      const onEnd = vi.fn();
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition({ onEnd }));

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });

      act(() => mockInstance!.stop());
      await act(async () => { vi.advanceTimersByTime(10); });
      expect(onEnd).toHaveBeenCalled();
    });
  });

  describe("configuration", () => {
    it("passes continuous option to recognition instance", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition({ continuous: false }));
      act(() => result.current.start());
      expect(mockInstance!.continuous).toBe(false);
    });

    it("passes language option to recognition instance", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition({ language: "es-ES" }));
      act(() => result.current.start());
      expect(mockInstance!.lang).toBe("es-ES");
    });

    it("defaults to continuous=true and language=en-US", async () => {
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());
      act(() => result.current.start());
      expect(mockInstance!.continuous).toBe(true);
      expect(mockInstance!.lang).toBe("en-US");
    });
  });

  describe("cleanup", () => {
    it("stops recognition on unmount", async () => {
      const useSpeechRecognition = await loadHook();
      const { result, unmount } = renderHook(() => useSpeechRecognition());

      act(() => result.current.start());
      await act(async () => { vi.advanceTimersByTime(10); });
      expect(mockInstance!._started).toBe(true);

      unmount();
      expect(mockInstance!._started).toBe(false);
    });
  });

  describe("browser compatibility", () => {
    it("reports isSupported=false and sets error on start when API missing", async () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
      const useSpeechRecognition = await loadHook();
      const { result } = renderHook(() => useSpeechRecognition());

      expect(result.current.isSupported).toBe(false);

      act(() => result.current.start());
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("not supported");
    });
  });
});
