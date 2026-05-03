import { useState, useCallback, useEffect, useRef } from "react";

export function useFieldResize(fieldId: string, defaultHeight: number) {
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === "undefined") return defaultHeight;
    const saved = localStorage.getItem(`axtask_field_height_${fieldId}`);
    return saved ? parseInt(saved, 10) : defaultHeight;
  });

  const updateHeight = useCallback((newHeight: number) => {
    setHeight(newHeight);
    if (typeof window !== "undefined") {
      localStorage.setItem(`axtask_field_height_${fieldId}`, newHeight.toString());
    }
  }, [fieldId]);

  return { height, updateHeight };
}
