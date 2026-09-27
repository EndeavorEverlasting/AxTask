import { useMemo, useState } from "react";
import type { Task } from "@shared/schema";
import { buildActivityReportHtml, buildTaskActivityReport } from "@shared/activity-report";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Download, ExternalLink, ShieldCheck } from "lucide-react";

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 4, 1);
  return { from: localIsoDate(from), to: localIsoDate(today) };
}

function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openPrintableHtml(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ActivityBrief({ tasks }: { tasks: readonly Task[] }) {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const reportResult = useMemo(() => {
    try {
      return {
        privateReport: buildTaskActivityReport(tasks, { from, to }, "private"),
        showcaseReport: buildTaskActivityReport(tasks, { from, to }, "showcase"),
        error: null,
      };
    } catch (error) {
      return {
        privateReport: null,
        showcaseReport: null,
        error: error instanceof Error ? error.message : "Invalid activity range",
      };
    }
  }, [tasks, from, to]);

  const report = reportResult.privateReport;
  const showcaseReport = reportResult.showcaseReport;
  const monthData = report?.byMonth.map((row) => ({
    month: row.label,
    total: row.total,
    completed: row.completed,
  })) ?? [];

  const exportHtml = showcaseReport
    ? buildActivityReportHtml(showcaseReport, {
        title: "Activity Brief",
        subtitle: "A portfolio-ready view of work cadence, delivery, and focus areas.",
      })
    : null;

  return (
    <Card className="glass-panel-glossy overflow-hidden">
      <CardHeader className="border-b border-white/10 bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Activity Brief</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Ask a bounded question like “What did my activity look like between January and May?” and use the same deterministic range model for an on-screen review or a privacy-safe showcase export.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!exportHtml}
              onClick={() => {
                if (!exportHtml) return;
                downloadHtml(`axtask-activity-brief-${from}-to-${to}.html`, exportHtml);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download showcase
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!exportHtml}
              onClick={() => {
                if (exportHtml) openPrintableHtml(exportHtml);
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open printable
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,180px)_minmax(0,180px)_1fr] lg:items-end">
          <label className="space-y-1.5 text-sm font-medium">
            <span>From</span>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>To</span>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <div className="flex min-h-10 items-center gap-2 rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            Showcase exports keep aggregate metrics but include detailed completed titles only for public activities. Notes and evidence are excluded.
          </div>
        </div>

        {reportResult.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {reportResult.error}
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border bg-background/55 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Activities</div>
                <div className="mt-1 text-3xl font-bold">{report.totals.activities}</div>
                <div className="text-xs text-muted-foreground">{report.totals.activeDays} active days</div>
              </div>
              <div className="rounded-xl border bg-background/55 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Completed</div>
                <div className="mt-1 text-3xl font-bold">{report.totals.completed}</div>
                <div className="text-xs text-muted-foreground">{report.totals.completionRate}% of range activity</div>
              </div>
              <div className="rounded-xl border bg-background/55 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">In progress</div>
                <div className="mt-1 text-3xl font-bold">{report.totals.inProgress}</div>
                <div className="text-xs text-muted-foreground">work still moving</div>
              </div>
              <div className="rounded-xl border bg-background/55 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Planned</div>
                <div className="mt-1 text-3xl font-bold">{report.totals.planned}</div>
                <div className="text-xs text-muted-foreground">scheduled / declared</div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
              <div>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Activity cadence</h3>
                  <p className="text-xs text-muted-foreground">Monthly activity and completed work inside the selected range.</p>
                </div>
                {monthData.length > 0 ? (
                  <ChartContainer
                    className="h-[240px] w-full"
                    config={{
                      total: { label: "Activities", color: "#0f766e" },
                      completed: { label: "Completed", color: "#38bdf8" },
                    }}
                  >
                    <BarChart data={monthData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                      <Bar dataKey="completed" fill="var(--color-completed)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                    No activity in this range.
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold">Focus areas</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.byClassification.length > 0 ? report.byClassification.map((row) => (
                      <span key={row.classification} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                        {row.classification} <strong className="ml-1">{row.total}</strong>
                      </span>
                    )) : <span className="text-xs text-muted-foreground">No classifications in range.</span>}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Completed highlights</h3>
                  <div className="mt-2 space-y-2">
                    {report.highlights.length > 0 ? report.highlights.slice(0, 6).map((item) => (
                      <div key={item.activityKey} className="grid grid-cols-[82px_1fr] gap-2 rounded-lg border bg-background/45 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">{item.date}</span>
                        <span className="font-medium">{item.title}</span>
                      </div>
                    )) : <span className="text-xs text-muted-foreground">No completed highlights in range.</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Historical proof level: current AxTask tasks are projected from their declared task date. The shared ledger/v1 contract records stronger occurred/completed timestamps and temporal confidence when source ledgers provide them, so future ingestion can improve this report without changing its range/report contract.
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
