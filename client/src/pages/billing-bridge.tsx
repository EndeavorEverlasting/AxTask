import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";
import { AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle,
} from "lucide-react";
import { TeamsSweepCard } from "@/components/billing/TeamsSweepCard";
import type { TeamsSweepSnapshot } from "@/lib/teams-graph/sweep";

/* ── Types mirrored from server ────────────────────────────────────────── */

interface ReconciliationException {
  work_date: string;
  canonical_name: string;
  exception_type: string;
  detail: string;
  evidence_sources: string[];
}

interface ReconciliationSummary {
  total_attendance_days: number;
  total_evidence_days: number;
  matched_days: number;
  exception_count: number;
}

interface FieldInsight {
  work_date: string;
  canonical_name: string;
  site: string;
  contribution_category: string;
  operational_insight: string;
  evidence_source: string;
}

interface AssignmentEvidence {
  canonical_name: string;
  work_date: string;
  outward_assignment: string;
  actual_categories: string[];
  exception_flag: boolean;
  exception_detail: string;
}

interface SuggestedFillRow {
  work_date: string;
  canonical_name: string;
  site: string;
  task_category: string;
  default_workstream: string;
  suggested_hours: number | null;
  evidence_source: string;
  evidence_detail: string;
  requires_review: true;
  reason: string;
}

interface BridgeResult {
  reconciliation: {
    exceptions: ReconciliationException[];
    summary: ReconciliationSummary;
  };
  contributions: {
    field_insights: FieldInsight[];
    experience_ledger: unknown[];
    assignment_evidence: AssignmentEvidence[];
  };
  people: { canonical_name: string; active: boolean }[];
  attendance_count: number;
  suggested_fill: {
    rows: SuggestedFillRow[];
    csv: string;
  };
  teams: null | {
    row_count: number;
    unmapped_display_names: string[];
    skipped_count: number;
    generated_at: string | null;
    topic_pattern: string | null;
    tool_version: string | null;
    strict: boolean;
  };
  ingest_errors: { source_sheet: string; field: string; message: string; workbook: string }[];
}

/* ── Component ─────────────────────────────────────────────────────────── */

function defaultMonthYyyyMm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBoundsYyyyMmDd(monthYyyyMm: string): { start: string; end: string } {
  const [y, m] = monthYyyyMm.split("-").map(Number);
  const last = new Date(y, m, 0);
  return {
    start: `${y}-${String(m).padStart(2, "0")}-01`,
    end: `${y}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`,
  };
}

export default function BillingBridgePage() {
  const [ttFile, setTtFile] = useState<File | null>(null);
  const [rbFile, setRbFile] = useState<File | null>(null);
  const [mwFile, setMwFile] = useState<File | null>(null);
  const [hoursMonth, setHoursMonth] = useState(defaultMonthYyyyMm);
  const [hoursTechQuery, setHoursTechQuery] = useState("");
  const [hoursProjectFilter, setHoursProjectFilter] = useState("");
  const [hoursFocusStart, setHoursFocusStart] = useState(() => monthBoundsYyyyMmDd(defaultMonthYyyyMm()).start);
  const [hoursFocusEnd, setHoursFocusEnd] = useState(() => monthBoundsYyyyMmDd(defaultMonthYyyyMm()).end);
  const [nameFilter, setNameFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [teamsSnapshot, setTeamsSnapshot] = useState<TeamsSweepSnapshot | null>(null);
  const [strictTeamsPresence, setStrictTeamsPresence] = useState(false);
  const [generateOptions, setGenerateOptions] = useState({
    rosterLog: true,
    taskTracker: true,
    neuronTracker: true,
    billingSummary: true,
  });

  const statusQuery = useQuery({
    queryKey: ["billing-bridge-status"],
    queryFn: () => apiRequest("GET", "/api/billing-bridge/status").then(r => r.json()),
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("taskTracker", ttFile!);
      fd.append("roster", rbFile!);
      if (mwFile) fd.append("manager", mwFile);
      fd.append("generateOptions", JSON.stringify(generateOptions));
      if (teamsSnapshot) {
        fd.append("teamsSnapshot", JSON.stringify(teamsSnapshot));
        fd.append("strictTeamsPresence", strictTeamsPresence ? "true" : "false");
      }
      const headers: Record<string, string> = {};
      const csrfToken = getCsrfToken();
      if (csrfToken) headers[AXTASK_CSRF_HEADER] = csrfToken;

      const res = await fetch("/api/billing-bridge/reconcile", {
        method: "POST",
        body: fd,
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message ?? res.statusText);
      return res.json() as Promise<BridgeResult>;
    },
  });

  const hoursReportMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("taskTracker", ttFile!);
      fd.append("roster", rbFile!);
      if (mwFile) fd.append("manager", mwFile);
      fd.append("technicianQuery", hoursTechQuery);
      fd.append("projectFilter", hoursProjectFilter);
      fd.append("month", hoursMonth);
      fd.append("focusStart", hoursFocusStart);
      fd.append("focusEnd", hoursFocusEnd);
      const headers: Record<string, string> = {};
      const csrfToken = getCsrfToken();
      if (csrfToken) headers[AXTASK_CSRF_HEADER] = csrfToken;

      const res = await fetch("/api/billing-bridge/hours-report", {
        method: "POST",
        body: fd,
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = await res.json();
          if (j?.message) msg = j.message;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const name = m?.[1] ?? `technician-hours-${hoursMonth}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const data = reconcileMutation.data;

  /* derived lists */
  const uniqueNames = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.reconciliation.exceptions.map(e => e.canonical_name))].sort();
  }, [data]);

  const exceptionTypes = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.reconciliation.exceptions.map(e => e.exception_type))].sort();
  }, [data]);

  const filteredExceptions = useMemo(() => {
    if (!data) return [];
    return data.reconciliation.exceptions.filter(e => {
      if (nameFilter !== "all" && e.canonical_name !== nameFilter) return false;
      if (typeFilter !== "all" && e.exception_type !== typeFilter) return false;
      return true;
    });
  }, [data, nameFilter, typeFilter]);

  const noAttendanceExceptions = useMemo(() => {
    if (!data) return [];
    return data.reconciliation.exceptions.filter(
      e => e.exception_type === "task_evidence_no_attendance",
    );
  }, [data]);

  const teamsVsRosterExceptions = useMemo(() => {
    if (!data) return [];
    return data.reconciliation.exceptions.filter(
      e => e.exception_type === "teams_presence_no_attendance"
        || e.exception_type === "teams_presence_no_task_evidence",
    );
  }, [data]);

  const canRun = !!ttFile && !!rbFile;
  const canRunHoursReport =
    canRun &&
    (hoursTechQuery.trim().length > 0 || hoursProjectFilter.trim().length > 0) &&
    hoursFocusStart.trim().length > 0 &&
    hoursFocusEnd.trim().length > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Billing Bridge Conjuration Station</h1>
          <p className="text-sm text-muted-foreground">
            Feed the AxTask beast your earthly spreadsheets and watch the digital magic happen! We bend time, space, and billable hours to our will.
          </p>
        </div>
      </div>

      {/* Upload section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summon the Truth</CardTitle>
          <CardDescription>
            Hand over your Task Tracker, Roster &amp; Billing, and the legendary Manager Workbook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FileInput label="Task Tracker *" file={ttFile} onFile={setTtFile} />
            <FileInput label="Roster & Billing *" file={rbFile} onFile={setRbFile} />
            <FileInput label="Manager Workbook" file={mwFile} onFile={setMwFile} />
          </div>

          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
            <Label className="text-base font-semibold text-foreground">What artifacts shall we conjure?</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="rosterLog"
                  checked={generateOptions.rosterLog}
                  onCheckedChange={(checked) => setGenerateOptions(prev => ({...prev, rosterLog: !!checked}))}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="rosterLog" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Generate the active roster log
                  </label>
                  <p className="text-xs text-muted-foreground">The ultimate truth ledger</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="taskTracker"
                  checked={generateOptions.taskTracker}
                  onCheckedChange={(checked) => setGenerateOptions(prev => ({...prev, taskTracker: !!checked}))}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="taskTracker" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Generate the task tracker
                  </label>
                  <p className="text-xs text-muted-foreground">The daily grind evidence</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="neuronTracker"
                  checked={generateOptions.neuronTracker}
                  onCheckedChange={(checked) => setGenerateOptions(prev => ({...prev, neuronTracker: !!checked}))}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="neuronTracker" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Generate a neuron hour tracker
                  </label>
                  <p className="text-xs text-muted-foreground">Which is Bonita's log</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="billingSummary"
                  checked={generateOptions.billingSummary}
                  onCheckedChange={(checked) => setGenerateOptions(prev => ({...prev, billingSummary: !!checked}))}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="billingSummary" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Generate just the billing summary
                  </label>
                  <p className="text-xs text-muted-foreground">Show me the money</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => reconcileMutation.mutate()}
              disabled={!canRun || reconcileMutation.isPending}
            >
              {reconcileMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Conjuring…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />Run Reconciliation</>
              )}
            </Button>
            {teamsSnapshot && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline">
                  Including Teams snapshot ({teamsSnapshot.rows.length} rows)
                </Badge>
                <Checkbox
                  id="strictTeamsPresence"
                  checked={strictTeamsPresence}
                  onCheckedChange={(v) => setStrictTeamsPresence(!!v)}
                />
                <label htmlFor="strictTeamsPresence" className="cursor-pointer">
                  Strict: also flag Teams presence without task evidence
                </label>
              </div>
            )}
            {reconcileMutation.isError && (
              <span className="text-sm text-red-500">{reconcileMutation.error.message}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <TeamsSweepCard
        onSnapshot={setTeamsSnapshot}
        activeSnapshot={teamsSnapshot}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Technician hours report (Excel)</CardTitle>
          <CardDescription>
            Download a factual .xlsx from the same uploads: Live attendance, Billing Detail, and Manager rows
            with source references. Set the month window for detail totals and a separate focus date range
            (for example a specific week). Provide a technician name and/or a project filter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-sm">Technician (roster name)</Label>
              <Input
                value={hoursTechQuery}
                onChange={e => setHoursTechQuery(e.target.value)}
                placeholder="e.g. Valentin Nikoliuk"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Project filter (optional)</Label>
              <Input
                value={hoursProjectFilter}
                onChange={e => setHoursProjectFilter(e.target.value)}
                placeholder="Substring match on roster project slots"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Month (detail / ByProject)</Label>
              <Input
                type="month"
                value={hoursMonth}
                onChange={e => {
                  const v = e.target.value;
                  setHoursMonth(v);
                  const b = monthBoundsYyyyMmDd(v);
                  setHoursFocusStart(b.start);
                  setHoursFocusEnd(b.end);
                }}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Focus period start</Label>
              <Input
                type="date"
                value={hoursFocusStart}
                onChange={e => setHoursFocusStart(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Focus period end</Label>
              <Input
                type="date"
                value={hoursFocusEnd}
                onChange={e => setHoursFocusEnd(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Detail sheets require one resolved technician (or a project filter that matches exactly one roster row).
            Otherwise you still get roster-level totals by project when multiple people match.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void hoursReportMutation.mutate()}
              disabled={!canRunHoursReport || hoursReportMutation.isPending}
            >
              {hoursReportMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Building…</>
              ) : (
                <><FileSpreadsheet className="mr-2 h-4 w-4" />Download hours report (.xlsx)</>
              )}
            </Button>
            {hoursReportMutation.isError && (
              <span className="text-sm text-red-500">{hoursReportMutation.error.message}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <SummaryCard label="Attendance Days" value={data.reconciliation.summary.total_attendance_days} />
            <SummaryCard label="Evidence Days" value={data.reconciliation.summary.total_evidence_days} />
            <SummaryCard label="Matched Days" value={data.reconciliation.summary.matched_days} variant="success" />
            <SummaryCard label="Total Exceptions" value={data.reconciliation.summary.exception_count} variant="warning" />
            <SummaryCard label="No-Attendance Exceptions" value={noAttendanceExceptions.length} variant="danger" />
            <SummaryCard label="Teams vs Roster" value={teamsVsRosterExceptions.length} variant={teamsVsRosterExceptions.length > 0 ? "danger" : "success"} />
          </div>

          {data.suggested_fill.rows.length > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-sm">Suggested fill rows</strong>
                <Badge variant="outline" className="text-xs">
                  {data.suggested_fill.rows.length} review-only
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([data.suggested_fill.csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `suggested-fill-${new Date().toISOString().slice(0,10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <FileSpreadsheet className="mr-1 h-4 w-4" />Download CSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each row is labeled <code>requires_review: true</code> and uses Task Catalog
                defaults (e.g. Device Configuration). Nothing has been written to any
                workbook — this is a manual review aid.
              </p>
            </div>
          )}

          {data.teams && data.teams.unmapped_display_names.length > 0 && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
                <div className="space-y-1">
                  <strong>Unmapped Teams display names ({data.teams.unmapped_display_names.length}):</strong>
                  <div className="font-mono text-[11px]">{data.teams.unmapped_display_names.join(", ")}</div>
                  <div className="text-muted-foreground">
                    These display names did not resolve to a canonical roster name. Add
                    an alias row to <code>tools/billing_bridge/config/person_aliases.csv</code>
                    (alias_name, canonical_name, source_system) and re-run.
                  </div>
                </div>
              </div>
            </div>
          )}

          <Tabs defaultValue="exceptions" className="w-full">
            <TabsList>
              <TabsTrigger value="exceptions">
                Exceptions <Badge variant="outline" className="ml-1">{filteredExceptions.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="no-attendance">
                No Attendance <Badge variant="destructive" className="ml-1">{noAttendanceExceptions.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="field-insights">
                Field Insights <Badge variant="outline" className="ml-1">{data.contributions.field_insights.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="assignment-evidence">
                Assignment Evidence
              </TabsTrigger>
              {data.ingest_errors.length > 0 && (
                <TabsTrigger value="errors">
                  Errors <Badge variant="destructive" className="ml-1">{data.ingest_errors.length}</Badge>
                </TabsTrigger>
              )}
            </TabsList>

            {/* ── Exceptions tab ─────────────────────────────────── */}
            <TabsContent value="exceptions" className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <div className="w-52">
                  <Label className="text-xs">Person</Label>
                  <Select value={nameFilter} onValueChange={setNameFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({uniqueNames.length})</SelectItem>
                      {uniqueNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-64">
                  <Label className="text-xs">Exception Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {exceptionTypes.map(t => <SelectItem key={t} value={t}>{fmtType(t)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ExceptionsTable rows={filteredExceptions} />
            </TabsContent>

            {/* ── No-Attendance tab ──────────────────────────────── */}
            <TabsContent value="no-attendance" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                These {noAttendanceExceptions.length} person-day records have task evidence
                in the logs but <strong>no matching attendance record</strong>.
              </p>
              <ExceptionsTable rows={noAttendanceExceptions} />
            </TabsContent>

            {/* ── Field Insights tab ─────────────────────────────── */}
            <TabsContent value="field-insights">
              <div className="rounded-md border overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Insight</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.contributions.field_insights.map((fi, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-xs">{fi.work_date}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fi.canonical_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{fi.contribution_category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-xs truncate">{fi.operational_insight}</TableCell>
                        <TableCell className="text-xs">{fi.evidence_source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── Assignment Evidence tab ──────────────────────── */}
            <TabsContent value="assignment-evidence">
              <div className="rounded-md border overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead>Outward Assignment</TableHead>
                      <TableHead>Actual Categories</TableHead>
                      <TableHead>Mismatch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.contributions.assignment_evidence.map((ae, i) => (
                      <TableRow key={i} className={ae.exception_flag ? "bg-amber-50 dark:bg-amber-900/10" : ""}>
                        <TableCell className="whitespace-nowrap text-xs">{ae.work_date}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{ae.canonical_name}</TableCell>
                        <TableCell className="text-xs">{ae.outward_assignment}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {ae.actual_categories.map((c, ci) => (
                              <Badge key={ci} variant="secondary" className="text-[10px]">{c}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {ae.exception_flag ? (
                            <span className="text-amber-600 text-xs" title={ae.exception_detail}>
                              <AlertTriangle className="inline h-3 w-3 mr-1" />Mismatch
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs">
                              <CheckCircle2 className="inline h-3 w-3 mr-1" />OK
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── Errors tab ──────────────────────────────────── */}
            {data.ingest_errors.length > 0 && (
              <TabsContent value="errors">
                <div className="rounded-md border overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workbook</TableHead>
                        <TableHead>Sheet</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ingest_errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{e.workbook}</TableCell>
                          <TableCell className="text-xs">{e.source_sheet}</TableCell>
                          <TableCell className="text-xs">{e.field}</TableCell>
                          <TableCell className="text-xs">{e.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function FileInput({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <Input
        type="file"
        accept=".xlsx,.xls"
        onChange={e => onFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      {file && <p className="text-xs text-muted-foreground truncate">{file.name}</p>}
    </div>
  );
}

function SummaryCard({ label, value, variant }: { label: string; value: number; variant?: "success" | "warning" | "danger" }) {
  const color = variant === "success" ? "text-green-600" : variant === "warning" ? "text-amber-600" : variant === "danger" ? "text-red-600" : "";
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function ExceptionsTable({ rows }: { rows: ReconciliationException[] }) {
  return (
    <div className="rounded-md border overflow-auto max-h-[600px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Person</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No exceptions</TableCell></TableRow>
          ) : rows.map((e, i) => (
            <TableRow key={i}>
              <TableCell className="whitespace-nowrap text-xs">{e.work_date}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{e.canonical_name}</TableCell>
              <TableCell><ExceptionBadge type={e.exception_type} /></TableCell>
              <TableCell className="text-xs max-w-md">{e.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExceptionBadge({ type }: { type: string }) {
  const map: Record<string, { variant: "destructive" | "outline" | "secondary" | "default"; label: string }> = {
    task_evidence_no_attendance: { variant: "destructive", label: "No Attendance" },
    attendance_no_task_evidence: { variant: "outline", label: "No Evidence" },
    multiple_categories_same_day: { variant: "secondary", label: "Multi-Category" },
    split_unsupported: { variant: "secondary", label: "Split" },
    billing_mismatch: { variant: "destructive", label: "Billing Mismatch" },
    teams_presence_no_attendance: { variant: "destructive", label: "Teams vs Roster" },
    teams_presence_no_task_evidence: { variant: "outline", label: "Teams No Evidence" },
  };
  const cfg = map[type] ?? { variant: "outline" as const, label: type };
  return <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>;
}

function fmtType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

