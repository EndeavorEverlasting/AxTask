import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock } from "lucide-react";

type Mode = "hour" | "minute";
type Period = "AM" | "PM";

interface ClockTimePickerProps {
  value?: string;               // "HH:mm" 24h format
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/* ── helpers ─────────────────────────────────────────────────── */
function pad(n: number) { return n.toString().padStart(2, "0"); }

function parseTime(v?: string): { h: number; m: number; period: Period } {
  if (!v) return { h: 12, m: 0, period: "AM" };
  const [hh, mm] = v.split(":").map(Number);
  const period: Period = hh >= 12 ? "PM" : "AM";
  const h = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return { h, m: mm || 0, period };
}

function to24(h: number, m: number, period: Period): string {
  let hh = h;
  if (period === "AM" && h === 12) hh = 0;
  else if (period === "PM" && h !== 12) hh = h + 12;
  return `${pad(hh)}:${pad(m)}`;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/* ── ClockFace ───────────────────────────────────────────────── */
function ClockFace({
  mode, selected, onSelect,
}: {
  mode: Mode; selected: number; onSelect: (n: number) => void;
}) {
  const items = mode === "hour" ? HOURS : MINUTES;
  const RADIUS = 90;
  const CENTER = 120;

  // hand angle
  const handAngle = mode === "hour"
    ? ((selected % 12) / 12) * 360 - 90
    : (selected / 60) * 360 - 90;

  const handRad = (handAngle * Math.PI) / 180;
  const handX = CENTER + Math.cos(handRad) * (RADIUS - 10);
  const handY = CENTER + Math.sin(handRad) * (RADIUS - 10);

  return (
    <svg width={240} height={240} viewBox="0 0 240 240" className="select-none">
      {/* outer circle */}
      <circle cx={CENTER} cy={CENTER} r={RADIUS + 16} className="fill-muted/40 stroke-border" strokeWidth={1} />
      {/* centre dot */}
      <circle cx={CENTER} cy={CENTER} r={4} className="fill-primary" />
      {/* hand */}
      <line x1={CENTER} y1={CENTER} x2={handX} y2={handY}
        className="stroke-primary" strokeWidth={2} strokeLinecap="round" />
      <circle cx={handX} cy={handY} r={16} className="fill-primary/20" />

      {items.map((val, i) => {
        const angle = (i / 12) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const x = CENTER + Math.cos(rad) * RADIUS;
        const y = CENTER + Math.sin(rad) * RADIUS;
        const isSelected = val === selected;
        const label = mode === "minute" ? pad(val) : val.toString();

        return (
          <g key={val} onClick={() => onSelect(val)}
            className="cursor-pointer" role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(val); }}>
            <circle cx={x} cy={y} r={18}
              className={cn(
                "transition-colors",
                isSelected ? "fill-primary" : "fill-transparent hover:fill-primary/15"
              )} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
              className={cn(
                "text-xs font-medium pointer-events-none",
                isSelected ? "fill-primary-foreground" : "fill-foreground"
              )}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Main component ──────────────────────────────────────────── */
export function ClockTimePicker({
  value, onChange, placeholder = "Pick a time", className, disabled,
}: ClockTimePickerProps) {
  const parsed = parseTime(value);
  const [hour, setHour] = React.useState(parsed.h);
  const [minute, setMinute] = React.useState(parsed.m);
  const [period, setPeriod] = React.useState<Period>(parsed.period);
  const [mode, setMode] = React.useState<Mode>("hour");
  const [open, setOpen] = React.useState(false);

  // sync when value changes externally
  React.useEffect(() => {
    const p = parseTime(value);
    setHour(p.h); setMinute(p.m); setPeriod(p.period);
  }, [value]);

  const emit = (h: number, m: number, p: Period) => {
    onChange?.(to24(h, m, p));
  };

  const handleHourSelect = (h: number) => {
    setHour(h);
    setMode("minute");          // auto-advance to minute
  };

  const handleMinuteSelect = (m: number) => {
    setMinute(m);
    emit(hour, m, period);
    setOpen(false);             // close popover after full selection
    setMode("hour");            // reset for next open
  };

  const togglePeriod = () => {
    const next: Period = period === "AM" ? "PM" : "AM";
    setPeriod(next);
    if (value) emit(hour, minute, next);   // update immediately if already set
  };

  const displayTime = value
    ? `${hour}:${pad(minute)} ${period}`
    : undefined;

  return (
    <Popover modal open={open} onOpenChange={(o) => { setOpen(o); if (o) setMode("hour"); }}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline"
          className={cn("w-full pl-3 text-left font-normal justify-start", !value && "text-muted-foreground", className)}>
          <Clock className="mr-2 h-4 w-4 opacity-60" />
          {displayTime ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        {/* header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-baseline gap-1 text-2xl font-semibold tracking-tight">
            <button type="button" onClick={() => setMode("hour")}
              className={cn("px-1.5 py-0.5 rounded transition-colors",
                mode === "hour" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {pad(hour === 0 ? 12 : hour)}
            </button>
            <span>:</span>
            <button type="button" onClick={() => setMode("minute")}
              className={cn("px-1.5 py-0.5 rounded transition-colors",
                mode === "minute" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {pad(minute)}
            </button>
          </div>
          {/* AM / PM */}
          <div className="flex flex-col gap-0.5 ml-3">
            <Button type="button" size="sm" variant={period === "AM" ? "default" : "outline"}
              className="h-6 text-[10px] px-2" onClick={() => { if (period !== "AM") togglePeriod(); }}>AM</Button>
            <Button type="button" size="sm" variant={period === "PM" ? "default" : "outline"}
              className="h-6 text-[10px] px-2" onClick={() => { if (period !== "PM") togglePeriod(); }}>PM</Button>
          </div>
        </div>
        {/* clock face */}
        <ClockFace mode={mode}
          selected={mode === "hour" ? hour : minute}
          onSelect={mode === "hour" ? handleHourSelect : handleMinuteSelect} />
        {/* hint */}
        <p className="text-[11px] text-muted-foreground text-center mt-1">
          {mode === "hour" ? "Select hour" : "Select minutes"}
        </p>
      </PopoverContent>
    </Popover>
  );
}

