import { useState, useEffect, useCallback } from "react";

const ZOOM_KEY = "axtask-zoom";
const ZOOM_MIN = 50;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;

export function useZoom() {
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem(ZOOM_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= ZOOM_MIN && parsed <= ZOOM_MAX) return parsed;
    }
    return ZOOM_DEFAULT;
  });

  useEffect(() => {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  }, [zoom]);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(ZOOM_DEFAULT);
  }, []);

  return { zoom, zoomIn, zoomOut, resetZoom, ZOOM_MIN, ZOOM_MAX };
}

