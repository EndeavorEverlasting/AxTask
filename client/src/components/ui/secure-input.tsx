/**
 * SecureInput — FBI-style field hardening.
 *
 * When the field is NOT focused:
 *   - The DOM <input>.value is replaced with a truncated SHA-256 hash
 *   - DevTools / memory scrapers see the hash, not the real value
 *   - A 🔒 indicator shows the field is sealed
 *
 * When the field IS focused:
 *   - The real value is placed into the DOM for editing
 *   - On every keystroke the real value is stored in React state (parent-controlled)
 *
 * Additional hardening:
 *   - Clipboard is scrubbed 2s after any paste into the field
 *   - autocomplete / password-manager attrs are disabled
 *   - Configurable inactivity timeout clears the field value
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Lock, Unlock } from "lucide-react";

// ── Fast async SHA-256 via SubtleCrypto ────────────────────────────────────
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Deterministic mask: first 12 hex chars of SHA-256 ──────────────────────
function computeMask(hash: string): string {
  return hash ? `●●● ${hash.slice(0, 12)}…` : "";
}

export interface SecureInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  /** The real controlled value (stored only in React state). */
  value: string;
  /** Standard onChange — receives the real value. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Seconds of inactivity (blur) before the parent's value is cleared.
   * Set to 0 to disable. Default: 0 (disabled).
   */
  inactivityTimeout?: number;
  /** Called when inactivity timeout fires — parent should clear the value. */
  onInactivityClear?: () => void;
  /** If true, always mask (even when focused) — useful for password fields. */
  alwaysMask?: boolean;
}

const SecureInput = React.forwardRef<HTMLInputElement, SecureInputProps>(
  (
    {
      className,
      value,
      onChange,
      inactivityTimeout = 0,
      onInactivityClear,
      alwaysMask,
      type,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);
    const [maskedValue, setMaskedValue] = React.useState("");
    const internalRef = React.useRef<HTMLInputElement | null>(null);
    const inactivityTimer = React.useRef<ReturnType<typeof setTimeout>>();

    // Merge refs
    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        internalRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref]
    );

    // Recompute hash whenever value changes and field is blurred
    React.useEffect(() => {
      if (!focused && value) {
        sha256Hex(value).then((h) => setMaskedValue(computeMask(h)));
      } else if (!value) {
        setMaskedValue("");
      }
    }, [value, focused]);

    // ── Focus / Blur handlers ──────────────────────────────────────────────
    const handleFocus = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(true);
        // Restore real value into the DOM
        if (internalRef.current) internalRef.current.value = value;
        clearTimeout(inactivityTimer.current);
        props.onFocus?.(e);
      },
      [value, props.onFocus]
    );

    const handleBlur = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(false);
        // Replace DOM value with hash immediately
        if (internalRef.current && value) {
          sha256Hex(value).then((h) => {
            const mask = computeMask(h);
            setMaskedValue(mask);
            if (internalRef.current) internalRef.current.value = mask;
          });
        }
        // Start inactivity timer
        if (inactivityTimeout > 0 && onInactivityClear && value) {
          inactivityTimer.current = setTimeout(() => {
            onInactivityClear();
          }, inactivityTimeout * 1000);
        }
        props.onBlur?.(e);
      },
      [value, inactivityTimeout, onInactivityClear, props.onBlur]
    );

    // ── Clipboard scrub on paste ───────────────────────────────────────────
    const handlePaste = React.useCallback(
      (e: React.ClipboardEvent<HTMLInputElement>) => {
        props.onPaste?.(e);
        // Scrub clipboard 2s after paste to prevent exfiltration
        setTimeout(async () => {
          try {
            await navigator.clipboard.writeText("");
          } catch {
            // Clipboard API may not be available — fail silently
          }
        }, 2000);
      },
      [props.onPaste]
    );

    // Cleanup timer on unmount
    React.useEffect(() => () => clearTimeout(inactivityTimer.current), []);

    // The value shown in the DOM
    const displayValue = focused ? value : maskedValue;
    const inputType = focused ? type : "text"; // masked value is always text

    return (
      <div className="relative">
        <input
          ref={mergedRef}
          type={alwaysMask && !focused ? "password" : inputType}
          value={displayValue}
          onChange={focused ? onChange : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          readOnly={!focused}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-9 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            !focused && value && "text-muted-foreground font-mono text-xs",
            className
          )}
          {...props}
        />
        {/* Lock indicator */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {focused ? (
            <Unlock className="h-3.5 w-3.5 text-green-500/70" />
          ) : value ? (
            <Lock className="h-3.5 w-3.5 text-amber-500/70" />
          ) : null}
        </div>
      </div>
    );
  }
);

SecureInput.displayName = "SecureInput";
export { SecureInput };

