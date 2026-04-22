import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Sparkles } from "lucide-react";
import { wrapTextToLines } from "@/lib/pretext-layout";
import { polarToClockHour12, polarToClockMinute } from "@/lib/clock-face-math";

type Mode = "hour" | "minute";
type Period = "AM" | "PM";

interface ClockTimePickerProps {
  value?: string; // "HH:mm" 24h format
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const PRETEXT_FONT = "11px ui-sans-serif, system-ui, sans-serif";
const CAPTION_MAX_WIDTH = 196;
const TAGLINE_MAX_WIDTH = 168;

/* ── helpers ─────────────────────────────────────────────────── */
function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function parseTime(v?: string): { h: number; m: number; period: Period } {
  if (!v) return { h: 12, m: 0, period: "AM" };
  const [hh, mm] = v.split(":").map(Number);
  const period: Period = hh >= 12 ? "PM" : "AM";
  const h = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return { h, m: Number.isFinite(mm) ? mm : 0, period };
}

function to24(h: number, m: number, period: Period): string {
  let hh = h;
  if (period === "AM" && h === 12) hh = 0;
  else if (period === "PM" && h !== 12) hh = h + 12;
  return `${pad(hh)}:${pad(m)}`;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_TICKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** Whimsical copy — line-broken with pretext-layout for the caption bubble. */
const HOUR_QUIPS = [
  "The big hand is imaginary. The little hand is you. Choose an hour and make it official.",
  "Hours are just polite agreements. Pick one anyway—your task deserves a slot on the cosmic agenda.",
  "Somewhere a cuckoo is proud of you. Tap the rim to anchor this task in real-world time.",
  "Noon is a mood. Midnight is a vibe. This dial only judges you if you forget to pick.",
  "Spin the wheel of hours! Each spoke is a tiny promise to future-you.",
];

const MINUTE_QUIPS = [
  "Drag the rim for any minute, or tap a dot—precision without the guilt.",
  "Minutes: the spice rack of scheduling. A pinch of :27 can change everything.",
  "The hand follows your finger like a polite shadow. Release when the time feels honest.",
  "Almost there—tighten the moment like a jar lid. Drag, click, or both.",
  "Fine-tune destiny one minute at a time. No guilt if you land on :00 again. Classics exist for a reason.",
];

const PANEL_TAGLINE =
  "Pretext-powered chronometer — wraps words so tightly even Father Time squints.";

const RADIUS = 88;
const CENTER = 120;

/* ── ClockFace ───────────────────────────────────────────────── */
function ClockFace({
  mode,
  selected,
  onDiscreteSelect,
  onRimDrag,
  onRimRelease,
}: {
  mode: Mode;
  selected: number;
  onDiscreteSelect: (n: number) => void;
  onRimDrag?: (n: number) => void;
  onRimRelease?: () => void;
}) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const draggingRef = React.useRef(false);

  const items = mode === "hour" ? HOURS : MINUTE_TICKS;

  const handAngle =
    mode === "hour" ? ((selected % 12) / 12) * 360 - 90 : (selected / 60) * 360 - 90;

  const handRad = (handAngle * Math.PI) / 180;
  const handX = CENTER + Math.cos(handRad) * (RADIUS - 8);
  const handY = CENTER + Math.sin(handRad) * (RADIUS - 8);

  const gradId = React.useId().replace(/:/g, "");

  const pointerFromEvent = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    const dx = loc.x - CENTER;
    const dy = loc.y - CENTER;
    return mode === "hour" ? polarToClockHour12(dx, dy) : polarToClockMinute(dx, dy);
  };

  const onPointerDownRim = (e: React.PointerEvent) => {
    if (e.button !== 0 || !onRimDrag) return;
    const n = pointerFromEvent(e);
    if (n === null) return;
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    onRimDrag(n);
  };

  const onPointerMoveRim = (e: React.PointerEvent) => {
    if (!draggingRef.current || !onRimDrag) return;
    const n = pointerFromEvent(e);
    if (n === null) return;
    onRimDrag(n);
  };

  const onPointerUpRim = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onRimRelease?.();
  };

  return (
    <svg
      ref={svgRef}
      width={240}
      height={240}
      viewBox="0 0 240 240"
      className="select-none drop-shadow-sm touch-none"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="50%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>

      <circle cx={CENTER} cy={CENTER} r={RADIUS + 18} fill={`url(#${gradId})`} className="opacity-95 dark:opacity-80" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS + 14}
        className="fill-background/90 stroke-border/60 dark:stroke-border"
        strokeWidth={1.5}
      />
      <circle cx={CENTER} cy={CENTER} r={RADIUS + 4} fill="none" className="stroke-muted-foreground/15" strokeWidth={1} strokeDasharray="3 7" />

      <circle cx={CENTER} cy={CENTER} r={RADIUS - 2} className="fill-primary/8 dark:fill-primary/15" />

      <circle cx={CENTER} cy={CENTER} r={5} className="fill-primary drop-shadow-[0_0_6px_rgba(99,102,241,0.45)]" />
      <line
        x1={CENTER}
        y1={CENTER}
        x2={handX}
        y2={handY}
        className="stroke-primary"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 3px rgba(99,102,241,0.5))" }}
      />
      <circle cx={handX} cy={handY} r={15} className="fill-primary/25 stroke-primary/40" strokeWidth={1} />

      {items.map((val, i) => {
        const angle = (i / 12) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const x = CENTER + Math.cos(rad) * RADIUS;
        const y = CENTER + Math.sin(rad) * RADIUS;
        const isSelected = val === selected;
        const label = mode === "minute" ? pad(val) : val.toString();

        return (
          <g
            key={val}
            onClick={() => onDiscreteSelect(val)}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") onDiscreteSelect(val);
            }}
          >
            <circle
              cx={x}
              cy={y}
              r={19}
              className={cn(
                "transition-all duration-200",
                isSelected
                  ? "fill-primary scale-105"
                  : "fill-transparent hover:fill-primary/12 hover:stroke-primary/25 stroke-transparent stroke-[1.5]",
              )}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className={cn(
                "text-[11px] font-semibold pointer-events-none tracking-tight",
                isSelected ? "fill-primary-foreground" : "fill-foreground",
              )}
            >
              {label}
            </text>
          </g>
        );
      })}

      {onRimDrag ? (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 12}
          fill="transparent"
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDownRim}
          onPointerMove={onPointerMoveRim}
          onPointerUp={onPointerUpRim}
          onPointerCancel={onPointerUpRim}
        />
      ) : null}
    </svg>
  );
}

function useQuipIndex(open: boolean, mode: Mode, hour: number, minute: number) {
  const [seed, setSeed] = React.useState(0);
  React.useEffect(() => {
    if (open) setSeed(Math.floor(Math.random() * 997));
  }, [open]);
  const pool = mode === "hour" ? HOUR_QUIPS.length : MINUTE_QUIPS.length;
  return Math.abs((seed * 13 + hour * 3 + minute * 5 + (mode === "minute" ? 7 : 0)) % pool);
}

/* ── Main component ──────────────────────────────────────────── */
export function ClockTimePicker({
  value,
  onChange,
  placeholder = "Pick a time",
  className,
  disabled,
}: ClockTimePickerProps) {
  const parsed = parseTime(value);
  const [hour, setHour] = React.useState(parsed.h);
  const [minute, setMinute] = React.useState(parsed.m);
  const [period, setPeriod] = React.useState<Period>(parsed.period);
  const [mode, setMode] = React.useState<Mode>("hour");
  const [open, setOpen] = React.useState(false);

  const hourRef = React.useRef(hour);
  const minuteRef = React.useRef(minute);
  const periodRef = React.useRef(period);
  hourRef.current = hour;
  minuteRef.current = minute;
  periodRef.current = period;

  React.useEffect(() => {
    const p = parseTime(value);
    setHour(p.h);
    setMinute(p.m);
    setPeriod(p.period);
  }, [value]);

  const quipIndex = useQuipIndex(open, mode, hour, minute);
  const activeQuip = mode === "hour" ? HOUR_QUIPS[quipIndex] : MINUTE_QUIPS[quipIndex];
  const captionLines = React.useMemo(
    () => wrapTextToLines(activeQuip, CAPTION_MAX_WIDTH, PRETEXT_FONT),
    [activeQuip],
  );
  const taglineLines = React.useMemo(
    () => wrapTextToLines(PANEL_TAGLINE, TAGLINE_MAX_WIDTH, "10px ui-sans-serif, system-ui, sans-serif"),
    [],
  );

  const emit = (h: number, m: number, p: Period) => {
    onChange?.(to24(h, m, p));
  };

  const syncFromValue = () => {
    const p = parseTime(value);
    setHour(p.h);
    setMinute(p.m);
    setPeriod(p.period);
  };

  const handleHourSelect = (h: number) => {
    setHour(h);
    setMode("minute");
  };

  const handleMinuteSelect = (m: number) => {
    setMinute(m);
    emit(hourRef.current, m, periodRef.current);
    setOpen(false);
    setMode("hour");
  };

  const handleMinuteRimDrag = (m: number) => {
    setMinute(m);
  };

  const handleMinuteRimRelease = () => {
    emit(hourRef.current, minuteRef.current, periodRef.current);
    setOpen(false);
    setMode("hour");
  };

  const handleHourRimDrag = (h: number) => {
    setHour(h);
  };

  const handleHourRimRelease = () => {
    setMode("minute");
  };

  const handlePeriodToggle = (p: Period) => {
    setPeriod(p);
    if (mode === "minute" || value) {
      emit(hourRef.current, minuteRef.current, p);
      setOpen(false);
      setMode("hour");
    }
  };

  const handleConfirm = () => {
    emit(hourRef.current, minuteRef.current, periodRef.current);
    setOpen(false);
    setMode("hour");
  };

  const handleCancel = () => {
    setOpen(false);
    setMode("hour");
    syncFromValue();
  };

  const displayTime = value ? `${hour}:${pad(minute)} ${period}` : undefined;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className={cn(
          "w-full pl-3 text-left font-normal justify-start border-dashed hover:border-primary/40 hover:bg-violet-500/5 dark:hover:bg-violet-500/10 transition-colors",
          !value && "text-muted-foreground",
          className,
        )}
        onClick={() => {
          setOpen(true);
          setMode("hour");
          syncFromValue();
        }}
      >
        <Clock className="mr-2 h-4 w-4 opacity-70 text-violet-500 dark:text-violet-400" />
        {displayTime ?? placeholder}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <DialogContent
          hideCloseButton
          className="flex flex-col items-center justify-center w-[100vw] max-w-none h-[100dvh] max-h-none m-0 p-0 border-0 rounded-none bg-gradient-to-br from-violet-950/95 via-slate-950 to-indigo-950/95 sm:rounded-none"
        >
          <DialogTitle className="sr-only">Select time</DialogTitle>

          <div className="text-center pt-6 pb-2 px-4">
            <div className="flex items-center justify-center gap-1.5 text-violet-300 mb-2">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-widest">Chrono nook</span>
            </div>
            {taglineLines.map((line, i) => (
              <p key={i} className="text-xs leading-snug text-slate-400 italic">
                {line}
              </p>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 px-6">
            <div className="flex items-baseline gap-1 text-4xl sm:text-5xl font-bold tracking-tight font-mono tabular-nums">
              <button
                type="button"
                onClick={() => setMode("hour")}
                className={cn(
                  "px-3 py-2 rounded-xl transition-all duration-200",
                  mode === "hour"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-[1.02]"
                    : "hover:bg-white/10 text-slate-400 hover:text-white",
                )}
              >
                {pad(hour === 0 ? 12 : hour)}
              </button>
              <span className="text-slate-500 animate-pulse">:</span>
              <button
                type="button"
                onClick={() => setMode("minute")}
                className={cn(
                  "px-3 py-2 rounded-xl transition-all duration-200",
                  mode === "minute"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-[1.02]"
                    : "hover:bg-white/10 text-slate-400 hover:text-white",
                )}
              >
                {pad(minute)}
              </button>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button
                type="button"
                size="sm"
                variant={period === "AM" ? "default" : "outline"}
                className={cn("h-9 text-xs px-4 font-bold", period !== "AM" && "border-slate-600 text-slate-300 hover:bg-white/10")}
                onClick={() => handlePeriodToggle("AM")}
              >
                AM
              </Button>
              <Button
                type="button"
                size="sm"
                variant={period === "PM" ? "default" : "outline"}
                className={cn("h-9 text-xs px-4 font-bold", period !== "PM" && "border-slate-600 text-slate-300 hover:bg-white/10")}
                onClick={() => handlePeriodToggle("PM")}
              >
                PM
              </Button>
            </div>
          </div>

          <div className="flex justify-center py-2">
            <ClockFace
              mode={mode}
              selected={mode === "hour" ? hour : minute}
              onDiscreteSelect={mode === "hour" ? handleHourSelect : handleMinuteSelect}
              onRimDrag={mode === "hour" ? handleHourRimDrag : handleMinuteRimDrag}
              onRimRelease={mode === "hour" ? handleHourRimRelease : handleMinuteRimRelease}
            />
          </div>

          <div
            className={cn(
              "mx-6 max-w-xs rounded-2xl border px-4 py-3 relative",
              "border-violet-500/30 bg-violet-950/40",
              "shadow-inner shadow-violet-500/5",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400 mb-1">
              {mode === "hour" ? "Hour whispers" : "Minute musings"}
            </p>
            {captionLines.map((line, i) => (
              <p
                key={i}
                className="text-xs leading-relaxed text-violet-100/90 font-medium"
              >
                {line}
              </p>
            ))}
          </div>

          <div className="flex justify-center gap-3 pt-3 pb-6 px-6">
            <Button type="button" variant="outline" size="lg" onClick={handleCancel} className="border-slate-600 text-slate-300 hover:bg-white/10 px-8">
              Cancel
            </Button>
            <Button type="button" size="lg" onClick={handleConfirm} className="px-8">
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
