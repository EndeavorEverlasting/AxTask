import { useCallback, useRef } from "react";
import { getFirstFieldId, getNextFieldId } from "@/lib/task-field-flow-registry";

export function useTaskFocusFlow() {
  const fieldRefs = useRef<Map<string, HTMLElement>>(new Map());

  const registerField = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      fieldRefs.current.set(id, element);
    } else {
      fieldRefs.current.delete(id);
    }
  }, []);

  const focusFirst = useCallback(() => {
    const firstId = getFirstFieldId();
    const el = fieldRefs.current.get(firstId);
    if (el) {
      el.focus();
    }
  }, []);

  const cycleNext = useCallback(() => {
    let currentId: string | undefined;
    if (typeof document !== "undefined" && document.activeElement) {
      for (const [id, el] of fieldRefs.current.entries()) {
        if (el === document.activeElement) {
          currentId = id;
          break;
        }
      }
    }

    if (!currentId) {
      focusFirst();
      return;
    }
    const nextId = getNextFieldId(currentId);
    if (nextId) {
      const el = fieldRefs.current.get(nextId);
      if (el) {
        el.focus();
      }
    } else {
      focusFirst();
    }
  }, [focusFirst]);

  return { registerField, focusFirst, cycleNext, fieldRefs };
}
