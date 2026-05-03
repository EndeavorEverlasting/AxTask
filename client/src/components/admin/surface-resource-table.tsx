import { useEffect, useRef, useState } from "react";
import { Activity, Pause, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  perfLedger,
  type PerfLedger,
  type PerfLedgerSnapshot,
  type PerfSurfaceRow,
} from "@/lib/perf-ledger";

/**
 * Admin > Performance > "Surface resource usage" panel.
 *
 * Reads from the global `PerfLedger` (or an injected one, for tests) and
 * shows which AxTask surfaces spent the most main-thread time in the
 * rolling window. Data is client-local; nothing is persisted or sent to
 * the server. Matches the doctrine of `ClientPerfPanel`.
 *
 * The panel polls the ledger on a 1 Hz interval so the page itself is not
 * a source of render churn while the operator is also measuring jank.
 */

type SortKey =
  | "surface"
  | "totalMs"
  | "p95Ms"
  | "updates"
  | "longtaskMs"
  | "maxRowCount";

const DEFAULT_POLL_MS = 1000;

export interface SurfaceResourceTableProps {
  ledger?: PerfLedger;
  pollMs?: number;
}

function toneForTotal(ms: number): "ok" | "warn" | "bad" {
  if (ms === 0) return "ok";
  if (ms < 250) return "ok";
  if (ms < 1_000) return "warn";
  return "bad";
}

function toneBadge(
  tone: "ok" | "warn" | "bad",
): "outline" | "secondary" | "destructive" {
  if (tone === "bad") return "destructive";
  if (tone === "warn") return "secondary";
  return "outline";
}

function sortRows(rows: PerfSurfaceRow[], key: SortKey): PerfSurfaceRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (key === "surface") return a.surface.localeCompare(b.surface);
    return (b[key] as number) - (a[key] as number);
  });
  return sorted;
}

export function SurfaceResourceTable({
  ledger,
  pollMs = DEFAULT_POLL_MS,
}: SurfaceResourceTableProps) {
  const effectiveLedger = ledger ?? perfLedger();
  const [snapshot, setSnapshot] = useState<PerfLedgerSnapshot>(() =>
    effectiveLedger.snapshot(),
  );
  const [frozen, setFrozen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("totalMs");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (frozen) return;
    const tick = () => setSnapshot(effectiveLedger.snapshot());
    tick();
    timerRef.current = setInterval(tick, Math.max(200, pollMs));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [effectiveLedger, pollMs, frozen]);

  const rows = sortRows(snapshot.rows, sortKey);
  const totalMs = rows.reduce((s, r) => s + r.totalMs, 0);
  const anyLongTask = rows.some((r) => r.longtaskMs > 0);

  return (
    <Card data-testid="surface-resource-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              Surface resource usage (client-side)
            </CardTitle>
            <CardDescription className="mt-1">
              Which AxTask surfaces spent the most main-thread time in the
              last {Math.round(snapshot.windowMs / 1000)}s. Reported by the
              surfaces themselves (React hook or imperative controller). Not
              sent to the server.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFrozen((f) => !f)}
              data-testid="surface-freeze-toggle"
            >
              {frozen ? (
                <>
                  <Play className="h-3.5 w-3.5 mr-1" aria-hidden />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1" aria-hidden />
                  Freeze
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                effectiveLedger.reset();
                setSnapshot(effectiveLedger.snapshot());
              }}
              data-testid="surface-reset"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Total tracked: <strong className="tabular-nums">{snapshot.totalMarks}</strong> marks
          </span>
          <span>
            Total ms: <strong className="tabular-nums">{totalMs.toFixed(1)}</strong>
          </span>
          <span>
            Long-task cost: {anyLongTask ? (
              <Badge variant="destructive" className="ml-1">attributed</Badge>
            ) : (
              <Badge variant="outline" className="ml-1">none</Badge>
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => setSortKey("surface")}
                    data-testid="sort-surface"
                    className="text-left"
                  >
                    Surface
                  </button>
                </TableHead>
                <TableHead className="text-right">Mounts</TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => setSortKey("updates")} data-testid="sort-updates">
                    Updates
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => setSortKey("p95Ms")} data-testid="sort-p95">
                    p95 ms
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => setSortKey("totalMs")} data-testid="sort-total">
                    Total ms
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => setSortKey("longtaskMs")} data-testid="sort-longtask">
                    Long-task ms
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button type="button" onClick={() => setSortKey("maxRowCount")} data-testid="sort-rows">
                    Rows
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6" data-testid="surface-empty">
                    No surfaces reporting yet. Interact with the app to
                    populate this table.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const tone = toneForTotal(r.totalMs);
                  return (
                    <TableRow key={r.surface} data-testid={`surface-row-${r.surface}`}>
                      <TableCell className="font-medium">{r.surface}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.mounts}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.updates + r.renders}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.p95Ms.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={toneBadge(tone)}>{r.totalMs.toFixed(1)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.longtaskMs.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.maxRowCount || "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default SurfaceResourceTable;
