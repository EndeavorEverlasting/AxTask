import type { Task } from "./schema";
import { projectTaskToActivity, type ActivityRecord } from "./activity-ledger";

export type ActivityReportMode = "private" | "showcase";

export type ActivityReportRange = {
  from: string;
  to: string;
};

export type ActivityReport = {
  range: ActivityReportRange & { inclusiveDays: number };
  mode: ActivityReportMode;
  totals: {
    activities: number;
    completed: number;
    inProgress: number;
    planned: number;
    observed: number;
    cancelled: number;
    completionRate: number;
    activeDays: number;
  };
  byMonth: Array<{ month: string; label: string; total: number; completed: number }>;
  byClassification: Array<{ classification: string; total: number; completed: number }>;
  temporalConfidence: Array<{ confidence: ActivityRecord["temporalConfidence"]; total: number }>;
  highlights: Array<{
    activityKey: string;
    date: string;
    title: string;
    classification: string | null;
    project: string | null;
  }>;
  privateHighlightsWithheld: number;
  methodology: {
    aggregateScope: "all matching activities";
    detailPolicy: string;
    temporalBasis: string;
  };
};

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`${field} is not a valid date`);
}

function utcDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}

function normalizedClassification(record: ActivityRecord): string {
  return record.classification?.trim() || "Unclassified";
}

function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function buildActivityReport(
  records: readonly ActivityRecord[],
  range: ActivityReportRange,
  mode: ActivityReportMode = "private",
): ActivityReport {
  assertIsoDate(range.from, "from");
  assertIsoDate(range.to, "to");
  if (range.from > range.to) throw new Error("from must be on or before to");

  const selected = records
    .filter((record) => record.activityDate >= range.from && record.activityDate <= range.to)
    .slice()
    .sort((a, b) =>
      a.activityDate.localeCompare(b.activityDate)
      || a.title.localeCompare(b.title)
      || a.activityKey.localeCompare(b.activityKey),
    );

  const statusCounts = new Map<ActivityRecord["status"], number>();
  const activeDays = new Set<string>();
  const monthCounts = new Map<string, { total: number; completed: number }>();
  const classificationCounts = new Map<string, { total: number; completed: number }>();
  const confidenceCounts = new Map<ActivityRecord["temporalConfidence"], number>();

  for (const record of selected) {
    statusCounts.set(record.status, (statusCounts.get(record.status) ?? 0) + 1);
    activeDays.add(record.activityDate);

    const month = record.activityDate.slice(0, 7);
    const monthCount = monthCounts.get(month) ?? { total: 0, completed: 0 };
    monthCount.total += 1;
    if (record.status === "completed") monthCount.completed += 1;
    monthCounts.set(month, monthCount);

    const classification = normalizedClassification(record);
    const classificationCount = classificationCounts.get(classification) ?? { total: 0, completed: 0 };
    classificationCount.total += 1;
    if (record.status === "completed") classificationCount.completed += 1;
    classificationCounts.set(classification, classificationCount);

    confidenceCounts.set(record.temporalConfidence, (confidenceCounts.get(record.temporalConfidence) ?? 0) + 1);
  }

  const completed = statusCounts.get("completed") ?? 0;
  const detailEligible = selected.filter((record) =>
    record.status === "completed" && (mode === "private" || record.visibility === "public"),
  );
  const privateHighlightsWithheld = mode === "showcase"
    ? selected.filter((record) => record.status === "completed" && record.visibility !== "public").length
    : 0;

  const highlights = detailEligible
    .slice()
    .sort((a, b) =>
      b.activityDate.localeCompare(a.activityDate)
      || a.title.localeCompare(b.title)
      || a.activityKey.localeCompare(b.activityKey),
    )
    .slice(0, 12)
    .map((record) => ({
      activityKey: record.activityKey,
      date: record.activityDate,
      title: record.title,
      classification: record.classification,
      project: record.project,
    }));

  return {
    range: {
      ...range,
      inclusiveDays: Math.floor((utcDay(range.to) - utcDay(range.from)) / 86_400_000) + 1,
    },
    mode,
    totals: {
      activities: selected.length,
      completed,
      inProgress: statusCounts.get("in-progress") ?? 0,
      planned: statusCounts.get("planned") ?? 0,
      observed: statusCounts.get("observed") ?? 0,
      cancelled: statusCounts.get("cancelled") ?? 0,
      completionRate: percent(completed, selected.length),
      activeDays: activeDays.size,
    },
    byMonth: Array.from(monthCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => ({ month, label: monthLabel(month), ...counts })),
    byClassification: Array.from(classificationCounts.entries())
      .map(([classification, counts]) => ({ classification, ...counts }))
      .sort((a, b) => b.total - a.total || a.classification.localeCompare(b.classification))
      .slice(0, 10),
    temporalConfidence: (["observed", "declared", "recorded"] as const)
      .map((confidence) => ({ confidence, total: confidenceCounts.get(confidence) ?? 0 }))
      .filter((row) => row.total > 0),
    highlights,
    privateHighlightsWithheld,
    methodology: {
      aggregateScope: "all matching activities",
      detailPolicy: mode === "showcase"
        ? "Detailed task titles are included only when the source activity is public; notes and evidence are never exported."
        : "Detailed completed task titles are visible to the authenticated user; notes and evidence are not included in this report model.",
      temporalBasis: "Each activity carries an explicit temporal basis/confidence. Current AxTask tasks project from their declared task date until immutable completion events are available.",
    },
  };
}

export function buildTaskActivityReport(
  tasks: readonly Task[],
  range: ActivityReportRange,
  mode: ActivityReportMode = "private",
): ActivityReport {
  return buildActivityReport(tasks.map(projectTaskToActivity), range, mode);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function metric(label: string, value: string | number, hint: string): string {
  return `<section class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(String(value))}</div><div class="metric-hint">${escapeHtml(hint)}</div></section>`;
}

export function buildActivityReportHtml(
  report: ActivityReport,
  options: { title?: string; subtitle?: string } = {},
): string {
  const title = options.title?.trim() || "AxTask Activity Brief";
  const subtitle = options.subtitle?.trim() || "A deterministic temporal summary of recorded work";
  const maxMonth = Math.max(1, ...report.byMonth.map((row) => row.total));
  const months = report.byMonth.length > 0
    ? report.byMonth.map((row) => {
        const width = Math.max(3, Math.round((row.total / maxMonth) * 100));
        return `<div class="month-row"><div class="month-name">${escapeHtml(row.label)}</div><div class="bar-track"><div class="bar" style="width:${width}%"></div></div><div class="month-total">${row.total} · ${row.completed} done</div></div>`;
      }).join("")
    : `<p class="empty">No recorded activity falls inside this range.</p>`;

  const classifications = report.byClassification.length > 0
    ? report.byClassification.map((row) => `<span class="pill">${escapeHtml(row.classification)} <strong>${row.total}</strong></span>`).join("")
    : `<span class="empty">No classifications in range.</span>`;

  const highlights = report.highlights.length > 0
    ? `<ol class="highlights">${report.highlights.map((item) => `<li><span class="date">${escapeHtml(item.date)}</span><div><strong>${escapeHtml(item.title)}</strong>${item.classification ? `<span>${escapeHtml(item.classification)}</span>` : ""}</div></li>`).join("")}</ol>`
    : `<p class="empty">No detail-safe completed highlights are available for this export.</p>`;

  const withheld = report.privateHighlightsWithheld > 0
    ? `<p class="privacy-note">${report.privateHighlightsWithheld} private completed ${report.privateHighlightsWithheld === 1 ? "item was" : "items were"} intentionally withheld from showcase details.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#152033;background:#eef3f8}*{box-sizing:border-box}body{margin:0;padding:42px 20px;background:linear-gradient(135deg,#eef3f8,#f8fafc 48%,#eef7f4)}main{max-width:980px;margin:0 auto;background:rgba(255,255,255,.94);border:1px solid #dce5ed;border-radius:24px;box-shadow:0 24px 70px rgba(15,23,42,.12);overflow:hidden}.hero{padding:42px;background:linear-gradient(135deg,#10233e,#173b52 55%,#176b63);color:white}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:800;opacity:.72}.hero h1{font-size:38px;line-height:1.05;margin:10px 0}.hero p{margin:0;max-width:720px;color:#dceaf0}.range{margin-top:24px;display:inline-flex;gap:8px;align-items:center;padding:8px 12px;border:1px solid rgba(255,255,255,.22);border-radius:999px;font-size:13px}.content{padding:32px 42px 42px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:-54px;position:relative}.metric{background:#fff;border:1px solid #dce5ed;border-radius:16px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.08)}.metric-label{text-transform:uppercase;letter-spacing:.09em;font-size:10px;font-weight:800;color:#64748b}.metric-value{font-size:30px;font-weight:800;margin-top:5px}.metric-hint{font-size:12px;color:#64748b;margin-top:4px}.section{margin-top:34px}.section h2{font-size:17px;margin:0 0 14px}.month-row{display:grid;grid-template-columns:90px 1fr 110px;gap:12px;align-items:center;margin:10px 0;font-size:13px}.month-name{font-weight:700}.bar-track{height:12px;background:#e8eef3;border-radius:999px;overflow:hidden}.bar{height:100%;border-radius:999px;background:linear-gradient(90deg,#1d6d65,#2b7ca0)}.month-total{text-align:right;color:#64748b}.pills{display:flex;flex-wrap:wrap;gap:8px}.pill{padding:7px 10px;border-radius:999px;background:#edf5f4;border:1px solid #d2e5e2;font-size:12px}.pill strong{margin-left:4px}.highlights{list-style:none;padding:0;margin:0;border-top:1px solid #e2e8f0}.highlights li{display:grid;grid-template-columns:92px 1fr;gap:14px;padding:13px 0;border-bottom:1px solid #e2e8f0}.highlights .date{font-size:12px;color:#64748b;font-variant-numeric:tabular-nums}.highlights div span{display:block;font-size:11px;color:#64748b;margin-top:3px}.empty,.privacy-note{font-size:13px;color:#64748b}.privacy-note{padding:10px 12px;background:#f8fafc;border-left:3px solid #64748b}.method{margin-top:34px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.55;color:#64748b}.brand{font-weight:800;color:#176b63}@media(max-width:720px){body{padding:0;background:white}main{border:0;border-radius:0;box-shadow:none}.hero,.content{padding-left:22px;padding-right:22px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.month-row{grid-template-columns:72px 1fr}.month-total{grid-column:2;text-align:left}.hero h1{font-size:31px}}@media print{body{padding:0;background:white}main{box-shadow:none;border:0}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.metric,.bar,.pill{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<main>
<header class="hero"><div class="eyebrow">AxTask · Activity Intelligence</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><div class="range">${escapeHtml(report.range.from)} <span>→</span> ${escapeHtml(report.range.to)} · ${report.range.inclusiveDays} days</div></header>
<div class="content">
<div class="metrics">${metric("Activities", report.totals.activities, `${report.totals.activeDays} active days`)}${metric("Completed", report.totals.completed, `${report.totals.completionRate}% of range activity`)}${metric("In progress", report.totals.inProgress, "work still moving")}${metric("Planned", report.totals.planned, "scheduled / declared")}</div>
<section class="section"><h2>Activity cadence</h2>${months}</section>
<section class="section"><h2>Focus areas</h2><div class="pills">${classifications}</div></section>
<section class="section"><h2>Completed highlights</h2>${highlights}${withheld}</section>
<footer class="method"><span class="brand">AxTask temporal projection.</span> ${escapeHtml(report.methodology.detailPolicy)} ${escapeHtml(report.methodology.temporalBasis)}</footer>
</div>
</main>
</body>
</html>`;
}
