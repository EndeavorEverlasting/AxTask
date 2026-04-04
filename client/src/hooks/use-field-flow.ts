import { useState, useCallback, useRef, useEffect } from "react";

const FIELD_ORDER = [
  "date",
  "time",
  "status",
  "activity",
  "notes",
  "urgency",
  "impact",
  "effort",
  "prerequisites",
];

export function useFieldFlow() {
  const [hintField, setHintField] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHint = useCallback((nextField: string) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setHintField(nextField);
    clearTimer.current = setTimeout(() => {
      setHintField((current) => (current === nextField ? null : current));
    }, 4000);
  }, []);

  const onFieldBlur = useCallback((fieldName: string, fieldValue: unknown) => {
    const hasValue =
      fieldValue !== undefined &&
      fieldValue !== null &&
      fieldValue !== "";

    if (!hasValue) return;

    const idx = FIELD_ORDER.indexOf(fieldName);
    if (idx === -1 || idx === FIELD_ORDER.length - 1) return;

    scheduleHint(FIELD_ORDER[idx + 1]);
  }, [scheduleHint]);

  const isHinted = useCallback(
    (fieldName: string) => hintField === fieldName,
    [hintField]
  );

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  return { onFieldBlur, isHinted };
}
