import { useState } from "react";
import { Activity, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useFpsSampler, type FpsSamplerStats } from "@/hooks/use-fps-sampler";

/**
 * Admin > Performance > "This session" panel.
 *
 * Purely client-side sampling: FPS via requestAnimationFrame and long-task
 * count via PerformanceObserver. Nothing is persisted and nothing is shipped
 * to the server — this lets an operator spot-check how the SPA is behaving
 * on their own machine without polluting server-side metrics.
 */

function fpsTone(fps: number): "ok" | "warn" | "bad" {
  if (fps === 0) return "ok";
  if (fps >= 50) return "ok";
  if (fps >= 30) return "warn";
  return "bad";
}

function toneBadge(tone: "ok" | "warn" | "bad"): "outline" | "secondary" | "destructive" {
  if (tone === "bad") return "destructive";
  if (tone === "warn") return "secondary";
  return "outline";
}

function StatTile({
  label,
  value,
  tone,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad";
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Badge variant={toneBadge(tone)} className="text-[10px]">{tone.toUpperCase()}</Badge>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        {suffix ? <span className="text-sm text-muted-foreground ml-1">{suffix}</span> : null}
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

export function ClientPerfPanel() {
  const [enabled, setEnabled] = useState(true);
  const stats: FpsSamplerStats = useFpsSampler({ enabled });

  const currentTone = fpsTone(stats.current);
  const medianTone = fpsTone(stats.median);
  const lowTone = fpsTone(stats.low);
  const longTasksTone: "ok" | "warn" | "bad" =
    stats.longTasks === 0 ? "ok" : stats.longTasks < 5 ? "warn" : "bad";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              This session (client-side)
            </CardTitle>
            <CardDescription className="mt-1">
              Frame rate and long-task samples from <em>your browser only</em>. Nothing here is persisted
              or sent to the server. Use this to spot-check UI jank while you navigate the admin surface.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="fps-toggle" className="text-xs text-muted-foreground">Sampling</Label>
            <Switch
              id="fps-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="fps-sampler-toggle"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEnabled(false);
                setTimeout(() => setEnabled(true), 50);
              }}
              data-testid="fps-sampler-reset"
            >
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
          data-testid="fps-sampler-grid"
          data-running={stats.running ? "true" : "false"}
        >
          <StatTile
            label="Current FPS"
            value={stats.running ? stats.current.toFixed(1) : "—"}
            suffix="fps"
            tone={currentTone}
            hint="Latest frame gap"
          />
          <StatTile
            label="Median FPS"
            value={stats.running ? stats.median.toFixed(1) : "—"}
            suffix="fps"
            tone={medianTone}
            hint="Stable baseline over window"
          />
          <StatTile
            label="p5 (low) FPS"
            value={stats.running ? stats.low.toFixed(1) : "—"}
            suffix="fps"
            tone={lowTone}
            hint="Worst 1-in-20 frames"
          />
          <StatTile
            label="Long tasks"
            value={String(stats.longTasks)}
            tone={longTasksTone}
            hint=">=50ms main-thread blocks"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" aria-hidden />
          <span>
            Window {Math.round(stats.windowMs / 1000)}s · {stats.samples} frame samples ·{" "}
            {stats.running ? "live" : "paused"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default ClientPerfPanel;
