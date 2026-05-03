import * as React from "react";
import { cn } from "@/lib/utils";

export function ProgressStrip({
  value,
  className,
  tone = "default",
}: {
  value: number;
  className?: string;
  tone?: "default" | "success" | "warning";
}) {
  const width = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const toneClass =
    tone === "success"
      ? "from-emerald-400 to-emerald-600"
      : tone === "warning"
        ? "from-amber-400 to-orange-500"
        : "from-sky-400 to-indigo-500";

  return (
    <div className={cn("h-2 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-300", toneClass)} style={{ width: `${width}%` }} />
    </div>
  );
}
