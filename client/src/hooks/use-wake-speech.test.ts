import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWakeWordSpeech } from "./use-wake-speech";

interface MockSpeechResultItem {
  readonly transcript: string;
  readonly confidence: number;
}

interface MockSpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: MockSpeechResultItem;
}

interface MockSpeechResultList {
  readonly length: number;
  readonly [index: number]: MockSpeechResult;
}

interface MockSpeechEvent {
  results: MockSpeechResultList;
  resultIndex: number;
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => MockSpeechRecognition;
  webkitSpeechRecognition?: new () => MockSpeechRecognition;
}

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onresult: ((event: MockSpeechEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    setTimeout(() => this.onstart?.(), 0);
  }

  stop() {
    setTimeout(() => this.onend?.(), 0);
  }

  simulateFinal(transcript: string) {
    const event: MockSpeechEvent = {
      resultIndex: 0,
      results: {
        length: 1,
        0: {
          isFinal: true,
          length: 1,
          0: { transcript, confidence: 0.95 },
        },
      },
    };
    this.onresult?.(event);
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

describe("useWakeWordSpeech", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const Ctor = makeMockConstructor();
    (window as WindowWithSpeech).SpeechRecognition = Ctor;
    (window as WindowWithSpeech).webkitSpeechRecognition = Ctor;
    mockInstance = null;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (window as WindowWithSpeech).SpeechRecognition;
    delete (window as WindowWithSpeech).webkitSpeechRecognition;
  });

  it("invokes onWakeTranscript when wake phrase + shortcut match (final)", async () => {
    const onWake = vi.fn();
    renderHook(() =>
      useWakeWordSpeech({
        enabled: true,
        paused: false,
        onWakeTranscript: onWake,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockInstance).not.toBeNull();

    await act(async () => {
      mockInstance?.simulateFinal("hey AxTask go home");
      await vi.runAllTimersAsync();
    });

    expect(onWake).toHaveBeenCalledWith("hey AxTask go home");
  });

  it("does not invoke when paused", () => {
    const onWake = vi.fn();
    renderHook(() =>
      useWakeWordSpeech({
        enabled: true,
        paused: true,
        onWakeTranscript: onWake,
      }),
    );

    expect(mockInstance).toBeNull();
  });
});
