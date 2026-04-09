import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "axtask_sidebar_width_px";
export const DEFAULT_SIDEBAR_WIDTH = 256;
const MIN_OPEN_WIDTH = 200;
const MAX_WIDTH_FRAC = 0.38; // Changed from 0.62 to 0.38
const SNAP_HIDE_PX = 56;
const PEEK_STRIP_WIDTH = 28;

function clampWidth(w: number, vw: number): number {
  const cap = Math.min(560, Math.floor(vw * MAX_WIDTH_FRAC));
  return Math.max(0, Math.min(cap, Math.round(w)));
}

export type ImmersiveShellContextValue = {
  sidebarWidthPx: number;
  peekStripWidthPx: number;
  isNavFocus: boolean;
  isImmersive: boolean;
  setSidebarWidthPx: (w: number) => void;
  toggleSidebarHidden: () => void;
  beginResize: () => void;
  endResize: () => void;
  applyResizeDelta: (dx: number) => void;
  isResizing: boolean;
};

const ImmersiveShellContext = createContext<ImmersiveShellContextValue | null>(null);

export function ImmersiveShellProvider({ children }: { children: ReactNode }) {
  const [sidebarWidthPx, setSidebarWidthPxState] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [viewportW, setViewportW] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1200),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return;
      setSidebarWidthPxState(clampWidth(n, window.innerWidth));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      setViewportW(vw);
      setSidebarWidthPxState((w) => clampWidth(w, vw));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(sidebarWidthPx));
    } catch {
      /* ignore */
    }
  }, [sidebarWidthPx]);

  const setSidebarWidthPx = useCallback((w: number) => {
    setSidebarWidthPxState(clampWidth(w, typeof window !== "undefined" ? window.innerWidth : 1200));
  }, []);

  const toggleSidebarHidden = useCallback(() => {
    setSidebarWidthPxState((w) => (w === 0 ? DEFAULT_SIDEBAR_WIDTH : 0));
  }, []);

  const beginResize = useCallback(() => setIsResizing(true), []);

  const applyResizeDelta = useCallback((dx: number) => {
    setSidebarWidthPxState((w) => clampWidth(w + dx, window.innerWidth));
  }, []);

  const endResize = useCallback(() => {
    setIsResizing(false);
    setSidebarWidthPxState((w) => {
      const vw = window.innerWidth;
      if (w <= SNAP_HIDE_PX) return 0;
      if (w > 0 && w < MIN_OPEN_WIDTH) return MIN_OPEN_WIDTH;
      return clampWidth(w, vw);
    });
  }, []);

  const isNavFocus = sidebarWidthPx > 0 && sidebarWidthPx / Math.max(viewportW, 1) >= 0.38;
  const isImmersive = sidebarWidthPx === 0;

  const value = useMemo(
    (): ImmersiveShellContextValue => ({
      sidebarWidthPx,
      peekStripWidthPx: PEEK_STRIP_WIDTH,
      isNavFocus,
      isImmersive,
      setSidebarWidthPx,
      toggleSidebarHidden,
      beginResize,
      endResize,
      applyResizeDelta,
      isResizing,
    }),
    [
      sidebarWidthPx,
      isNavFocus,
      isImmersive,
      setSidebarWidthPx,
      toggleSidebarHidden,
      beginResize,
      endResize,
      applyResizeDelta,
      isResizing,
    ],
  );

  return <ImmersiveShellContext.Provider value={value}>{children}</ImmersiveShellContext.Provider>;
}

export function useImmersiveShell(): ImmersiveShellContextValue {
  const ctx = useContext(ImmersiveShellContext);
  if (!ctx) {
    throw new Error("useImmersiveShell must be used within ImmersiveShellProvider");
  }
  return ctx;
}
