import * as React from "react";
import { cn } from "@/lib/utils";

export function FloatingChip({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        tone === "success" ? "floating-chip-success" : tone === "warning" ? "floating-chip-warning" : "floating-chip-neutral",
        className,
      )}
      {...props}
    />
  );
}
