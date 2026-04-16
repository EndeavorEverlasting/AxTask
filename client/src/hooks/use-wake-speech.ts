import { useEffect, useRef } from "react";
import {
  matchVoiceShortcut,
  shouldProcessWakeListenerTranscript,
} from "@/lib/voice-shortcuts";

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string; readonly confidence: number };
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent {
  results: BrowserSpeechRecognitionResultList;
  resultIndex: number;
}

interface BrowserSpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

function getSpeechRecognitionAPI(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

/**
 * Continuous listener after first mic use. Paused while the main command mic is active.
 */
export function useWakeWordSpeech(options: {
  enabled: boolean;
  paused: boolean;
  onWakeTranscript: (raw: string) => void;
  language?: string;
}): void {
  const { enabled, paused, onWakeTranscript, language = "en-US" } = options;
  const onWakeRef = useRef(onWakeTranscript);
  onWakeRef.current = onWakeTranscript;
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const accumRef = useRef("");
  const shouldRunRef = useRef(false);

  useEffect(() => {
    const SpeechRecognitionAPI = getSpeechRecognitionAPI();
    if (!SpeechRecognitionAPI) return;

    const tryFire = (combined: string) => {
      const t = combined.trim();
      if (!t) return;
      if (!shouldProcessWakeListenerTranscript(t)) return;
      const shortcut = matchVoiceShortcut(t);
      if (!shortcut) return;
      onWakeRef.current(t);
      accumRef.current = "";
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };

    const startOne = () => {
      if (!shouldRunRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }

      accumRef.current = "";
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
        let interim = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const piece = result[0]?.transcript ?? "";
          if (result.isFinal) {
            finalChunk += piece;
          } else {
            interim += piece;
          }
        }
        if (finalChunk.trim()) {
          const piece = finalChunk.trim();
          accumRef.current = accumRef.current ? `${accumRef.current} ${piece}`.trim() : piece;
        }
        const live = interim.trim()
          ? `${accumRef.current} ${interim.trim()}`.trim()
          : accumRef.current;
        if (finalChunk.trim()) {
          tryFire(live);
        }
      };

      recognition.onerror = (ev: BrowserSpeechRecognitionErrorEvent) => {
        if (ev.error === "aborted") return;
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (shouldRunRef.current) {
          window.setTimeout(() => startOne(), 150);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        /* ignore */
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible" && enabled && !paused) {
        shouldRunRef.current = true;
        startOne();
      } else {
        shouldRunRef.current = false;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            /* ignore */
          }
          recognitionRef.current = null;
        }
      }
    };

    shouldRunRef.current = Boolean(enabled && !paused);
    document.addEventListener("visibilitychange", onVis);

    if (shouldRunRef.current && document.visibilityState === "visible") {
      startOne();
    }

    return () => {
      shouldRunRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    };
  }, [enabled, paused, language]);
}
