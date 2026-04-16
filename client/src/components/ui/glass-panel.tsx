import * as React from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({
  className,
  elevated = false,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  elevated?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        interactive ? "glass-panel-interactive" : elevated ? "glass-panel-elevated" : "glass-panel",
        className,
      )}
      {...props}
    />
  );
}
