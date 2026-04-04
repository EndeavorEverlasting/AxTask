import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";

export type GlowType = "hint" | "warning" | "tutorial";

export interface GlowTarget {
  id: string;
  type: GlowType;
  expiresAt?: number;
}

interface GlowContextValue {
  activeGlows: Map<string, GlowType>;
  setGlow: (id: string, type: GlowType, durationMs?: number) => void;
  clearGlow: (id: string) => void;
  clearAllGlows: (type?: GlowType) => void;
  isGlowing: (id: string, type?: GlowType) => boolean;
  getGlowClass: (id: string) => string;
}

const GLOW_CLASSES: Record<GlowType, string> = {
  hint: "field-glow-hint",
  warning: "field-glow-warning",
  tutorial: "field-glow-tutorial",
};

const DEFAULT_DURATIONS: Record<GlowType, number> = {
  hint: 4000,
  warning: 5000,
  tutorial: 0,
};

export function useGlowEngine(): GlowContextValue {
  const [activeGlows, setActiveGlows] = useState<Map<string, GlowType>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const existing = timers.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timers.current.delete(id);
    }
  }, []);

  const setGlow = useCallback((id: string, type: GlowType, durationMs?: number) => {
    clearTimer(id);

    setActiveGlows(prev => {
      const next = new Map(prev);
      next.set(id, type);
      return next;
    });

    const duration = durationMs ?? DEFAULT_DURATIONS[type];
    if (duration > 0) {
      const timer = setTimeout(() => {
        setActiveGlows(prev => {
          const next = new Map(prev);
          if (next.get(id) === type) next.delete(id);
          return next;
        });
        timers.current.delete(id);
      }, duration);
      timers.current.set(id, timer);
    }
  }, [clearTimer]);

  const clearGlow = useCallback((id: string) => {
    clearTimer(id);
    setActiveGlows(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, [clearTimer]);

  const clearAllGlows = useCallback((type?: GlowType) => {
    if (type) {
      setActiveGlows(prev => {
        const next = new Map(prev);
        for (const [id, t] of next) {
          if (t === type) {
            clearTimer(id);
            next.delete(id);
          }
        }
        return next;
      });
    } else {
      timers.current.forEach((_, id) => clearTimer(id));
      setActiveGlows(new Map());
    }
  }, [clearTimer]);

  const isGlowing = useCallback((id: string, type?: GlowType) => {
    const glowType = activeGlows.get(id);
    if (!glowType) return false;
    return type ? glowType === type : true;
  }, [activeGlows]);

  const getGlowClass = useCallback((id: string) => {
    const type = activeGlows.get(id);
    return type ? GLOW_CLASSES[type] : "";
  }, [activeGlows]);

  useEffect(() => {
    return () => {
      timers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  return { activeGlows, setGlow, clearGlow, clearAllGlows, isGlowing, getGlowClass };
}

const GlowContext = createContext<GlowContextValue | null>(null);

export function GlowProvider({ children }: { children: React.ReactNode }) {
  const engine = useGlowEngine();
  return <GlowContext.Provider value={engine}>{children}</GlowContext.Provider>;
}

export function useGlow() {
  const ctx = useContext(GlowContext);
  if (!ctx) throw new Error("useGlow must be used within GlowProvider");
  return ctx;
}
