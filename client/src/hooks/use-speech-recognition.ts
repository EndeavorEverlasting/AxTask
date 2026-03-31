import { useState, useCallback, useRef, useEffect } from "react";

export type SpeechStatus = "idle" | "listening" | "error";

interface SpeechRecognitionHook {
  isSupported: boolean;
  status: SpeechStatus;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  resetTranscript: () => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export function useSpeechRecognition(options?: {
  continuous?: boolean;
  language?: string;
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
}): SpeechRecognitionHook {
  const { continuous = true, language = "en-US", onResult, onEnd } = options || {};

  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);

  onResultRef.current = onResult;
  onEndRef.current = onEnd;

  const isSupported = !!SpeechRecognitionAPI;

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setStatus("idle");
    setInterimTranscript("");
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError("Speech recognition is not supported in this browser.");
      setStatus("error");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    setError(null);
    setTranscript("");
    setInterimTranscript("");

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setStatus("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setTranscript(prev => {
          const newTranscript = prev ? `${prev} ${final}` : final;
          onResultRef.current?.(final.trim());
          return newTranscript;
        });
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. Please allow microphone access in your browser settings.",
        "no-speech": "No speech was detected. Please try again.",
        "audio-capture": "No microphone was found. Please connect a microphone.",
        "network": "A network error occurred during speech recognition.",
        "aborted": "",
      };

      const msg = messages[event.error];
      if (msg === "") return;

      setError(msg || `Speech recognition error: ${event.error}`);
      setStatus("error");
    };

    recognition.onend = () => {
      setStatus("idle");
      setInterimTranscript("");
      onEndRef.current?.();
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e: any) {
      setError(e.message || "Failed to start speech recognition.");
      setStatus("error");
    }
  }, [continuous, language]);

  const toggle = useCallback(() => {
    if (status === "listening") {
      stop();
    } else {
      start();
    }
  }, [status, start, stop]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  return {
    isSupported,
    status,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    toggle,
    resetTranscript,
  };
}
