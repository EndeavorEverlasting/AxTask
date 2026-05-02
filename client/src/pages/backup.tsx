/**
 * Backup Center — dedicated page for account backup visibility and restore.
 */
import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePretextSurface } from "@/hooks/use-pretext-surface";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MfaVerificationPanel } from "@/components/mfa/mfa-verification-panel";
import { useMfaChallenge } from "@/hooks/use-mfa-challenge";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import {
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileCode,
  Database,
  Clock,
} from "lucide-react";

const LAST_BACKUP_KEY = "axtask:last-json-backup-download";

type UserExportBundle = {
  metadata: { exportMode?: string; exportedAt?: string; tableCounts?: Record<string, number> };
  data: Record<string, unknown[]>;
};

function isUserExportBundle(parsed: unknown): parsed is UserExportBundle {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  const m = p.metadata;
  const d = p.data;
  if (!m || typeof m !== "object") return false;
  if (!d || typeof d !== "object") return false;
  return (m as Record<string, unknown>).exportMode === "user";
}

interface AccountImportApiResult {
  success: boolean;
  dryRun: boolean;
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: Record<string, number>;
  errors?: { table: string; field: string; message: string }[];
  warnings?: { table: string; field: string; message: string }[];
}

interface AccountImportChallengeResponse {
  ownershipQuizRequired: boolean;
  tasksFingerprint: string;
  questionCount: number;
  questions: { id: string; prompt: string; choices: string[] }[];
  message?: string;
}

type ImportOwnershipAnswerPayload = { questionId: string; selectedIndex: number };

export default function BackupPage() {
  usePretextSurface("dense");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { requestChallenge: requestDataExportChallenge, isRequesting: dataExportCodeSending } = useMfaChallenge();
  const [dataExportMfaOpen, setDataExportMfaOpen] = useState(false);
  const [dataExportChallenge, setDataExportChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    maskedDestination?: string;
  } | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [jsonBundle, setJsonBundle] = useState<UserExportBundle | null>(null);
  const [jsonFileName, setJsonFileName] = useState("");
  const [jsonExportBusy, setJsonExportBusy] = useState(false);
  const [jsonAccountResult, setJsonAccountResult] = useState<AccountImportApiResult | null>(null);
  const [importOwnershipQuizOpen, setImportOwnershipQuizOpen] = useState(false);
  const [importOwnershipQuizQuestions, setImportOwnershipQuizQuestions] = useState<
    AccountImportChallengeResponse["questions"]
  >([]);
  const [importOwnershipQuizAnswers, setImportOwnershipQuizAnswers] = useState<Record<string, number>>({});
  const [importOwnershipQuizPendingDryRun, setImportOwnershipQuizPendingDryRun] = useState(true);
  const [importChallengeBusy, setImportChallengeBusy] = useState(false);

  useEffect(() => {
    try {
      setLastBackupAt(localStorage.getItem(LAST_BACKUP_KEY));
    } catch {
      // ignore
    }
  }, []);

  const { data: dataExportStepUp } = useQuery({
    queryKey: ["/api/account/data-export-step-up-status"],
    queryFn: async () => {
      const res = await fetch("/api/account/data-export-step-up-status", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load verification status");
      return res.json() as Promise<{
        stepUpRequired: boolean;
        stepUpSatisfied: boolean;
        expiresAt: number | null;
      }>;
    },
    staleTime: 15_000,
  });

  const accountDataStepUpBlocks =
    Boolean(dataExportStepUp?.stepUpRequired) && !dataExportStepUp?.stepUpSatisfied;

  const verifyDataExportStepUpMutation = useMutation({
    mutationFn: async (payload: { challengeId: string; code: string }) => {
      const res = await apiRequest("POST", "/api/account/data-export-step-up", payload);
      return res.json() as Promise<{ ok?: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/account/data-export-step-up-status"] });
      setDataExportMfaOpen(false);
      setDataExportChallenge(null);
      toast({
        title: "Verified",
        description: "You can download or import your JSON account backup for the next hour.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const startDataExportVerification = async () => {
    try {
      const c = await requestDataExportChallenge(MFA_PURPOSES.ACCOUNT_DATA_EXPORT);
      setDataExportChallenge({
        challengeId: c.challengeId,
        expiresAt: c.expiresAt,
        devCode: c.devCode,
        maskedDestination: c.maskedDestination,
      });
      setDataExportMfaOpen(true);
      toast({ title: "Code sent", description: "Check your email for the verification code." });
    } catch (e) {
      toast({
        title: "Could not send code",
        description: e instanceof Error ? e.message : "Try again later.",
        variant: "destructive",
      });
    }
  };

  function invalidateAfterAccountImport() {
    void queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/my-rewards"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/badges"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/gamification/classification-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/classification/categories"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/account/profile"] });
  }

  const accountJsonMutation = useMutation({
    mutationFn: async (opts: { dryRun: boolean; importOwnershipAnswers?: ImportOwnershipAnswerPayload[] }) => {
      if (!jsonBundle) throw new Error("No backup loaded");
      if (accountDataStepUpBlocks) {
        throw new Error("Verify your identity first (email code) before importing a JSON backup.");
      }
      const body: Record<string, unknown> = { bundle: jsonBundle, dryRun: opts.dryRun };
      if (opts.importOwnershipAnswers && opts.importOwnershipAnswers.length > 0) {
        body.importOwnershipAnswers = opts.importOwnershipAnswers;
      }
      const res = await apiRequest("POST", "/api/account/import", body);
      return (await res.json()) as AccountImportApiResult;
    },
    onSuccess: (data, opts) => {
      setJsonAccountResult(data);
      if (!opts.dryRun && data.success) {
        invalidateAfterAccountImport();
        setJsonBundle(null);
        setJsonFileName("");
        if (jsonInputRef.current) jsonInputRef.current.value = "";
        toast({
          title: "Backup import finished",
          description: "Your account data from the JSON file has been merged.",
        });
      } else if (!opts.dryRun && !data.success) {
        toast({
          title: "Backup import failed",
          description: data.errors?.[0]?.message ?? "See details below.",
          variant: "destructive",
        });
      } else if (opts.dryRun) {
        toast({
          title: data.success ? "Dry run OK" : "Dry run reported issues",
          description: data.success
            ? "Review counts below, then run a real import if it looks right."
            : (data.errors?.[0]?.message ?? "Check errors below."),
          variant: data.success ? "default" : "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "JSON import failed", description: err.message, variant: "destructive" });
    },
  });

  const beginJsonAccountImport = async (dryRun: boolean) => {
    if (!jsonBundle) return;
    if (accountDataStepUpBlocks) {
      toast({
        title: "Verification required",
        description: "Request a code and confirm your email before importing a JSON backup.",
        variant: "destructive",
      });
      return;
    }
    setJsonAccountResult(null);
    setImportChallengeBusy(true);
    try {
      const res = await apiRequest("POST", "/api/account/import/challenge", { bundle: jsonBundle });
      let ch: AccountImportChallengeResponse;
      try {
        ch = (await res.json()) as AccountImportChallengeResponse;
      } catch {
        throw new Error(`Challenge failed (${res.status})`);
      }
      if (!res.ok) {
        throw new Error(ch.message || `Challenge failed (${res.status})`);
      }
      if (ch.ownershipQuizRequired && ch.questions.length > 0) {
        setImportOwnershipQuizQuestions(ch.questions);
        setImportOwnershipQuizAnswers({});
        setImportOwnershipQuizPendingDryRun(dryRun);
        setImportOwnershipQuizOpen(true);
        return;
      }
      accountJsonMutation.mutate({ dryRun });
    } catch (e) {
      toast({
        title: "Could not start import",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setImportChallengeBusy(false);
    }
  };

  const submitImportOwnershipQuiz = () => {
    const answers: ImportOwnershipAnswerPayload[] = importOwnershipQuizQuestions.map((q) => ({
      questionId: q.id,
      selectedIndex: importOwnershipQuizAnswers[q.id] ?? -1,
    }));
    if (answers.some((a) => a.selectedIndex < 0)) {
      toast({
        title: "Answer every question",
        description: "Pick one option for each task detail before continuing.",
        variant: "destructive",
      });
      return;
    }
    setImportOwnershipQuizOpen(false);
    accountJsonMutation.mutate({
      dryRun: importOwnershipQuizPendingDryRun,
      importOwnershipAnswers: answers,
    });
  };

  const handleExportJsonBundle = async () => {
    if (accountDataStepUpBlocks) {
      toast({
        title: "Verification required",
        description: "Request a code and confirm your email before downloading your JSON backup.",
        variant: "destructive",
      });
      return;
    }
    setJsonExportBusy(true);
    try {
      const res = await apiRequest("GET", "/api/account/export");
      if (!res.ok) {
        let detail = "";
        try { detail = await res.text(); } catch { /* ignore */ }
        throw new Error(detail || `Export failed (${res.status})`);
      }
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      let url: string | undefined;
      try {
        url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `my-axtask-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        const iso = new Date().toISOString();
        localStorage.setItem(LAST_BACKUP_KEY, iso);
        setLastBackupAt(iso);
        toast({
          title: "JSON backup downloaded",
          description: "Includes tasks, wallet snapshot, badges, and related data.",
        });
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not download backup.",
        variant: "destructive",
      });
    } finally {
      setJsonExportBusy(false);
    }
  };

  const handleJsonFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setJsonAccountResult(null);
    const reader = new FileReader();
    reader.onerror = () => {
      toast({
        title: "Could not read file",
        description: reader.error?.message?.trim() || "Could not read this file.",
        variant: "destructive",
      });
      setJsonBundle(null);
      setJsonFileName("");
    };
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!isUserExportBundle(parsed)) {
          toast({
            title: "Not a user backup",
            description: 'Use an AxTask JSON export with exportMode "user" (Download JSON backup).',
            variant: "destructive",
          });
          setJsonBundle(null);
          setJsonFileName("");
          return;
        }
        setJsonBundle(parsed);
        setJsonFileName(file.name);
        setImportOwnershipQuizOpen(false);
        setImportOwnershipQuizQuestions([]);
        setImportOwnershipQuizAnswers({});
        const tc = parsed.metadata.tableCounts?.tasks;
        toast({
          title: "Backup loaded",
          description:
            typeof tc === "number"
              ? `${file.name} — ${tc.toLocaleString()} tasks in file. Run a dry run before importing.`
              : `${file.name} ready. Run a dry run before importing.`,
        });
      } catch (e) {
        toast({
          title: "Invalid JSON",
          description: e instanceof Error && e.message ? e.message : "Could not parse this file.",
          variant: "destructive",
        });
        setJsonBundle(null);
        setJsonFileName("");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Understand and control your data safety.
        </p>
      </div>

      {accountDataStepUpBlocks && !dataExportMfaOpen ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Identity verification required
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
              Email confirmation is needed before downloading or restoring a JSON backup.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={startDataExportVerification}
            disabled={dataExportCodeSending}
          >
            {dataExportCodeSending ? "Sending…" : "Email me a code"}
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backup Status
          </CardTitle>
          <CardDescription>Current state of your account backups</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Manual backup available</p>
                <p className="text-xs text-muted-foreground">
                  You can download a JSON backup anytime after identity verification.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
              <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Last downloaded backup</p>
                <p className="text-xs text-muted-foreground">
                  {lastBackupAt
                    ? new Date(lastBackupAt).toLocaleString()
                    : "Unknown — download a backup to track it here."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Restore dry run</p>
                <p className="text-xs text-muted-foreground">
                  Available — preview what a backup would change before applying it.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Automatic backups</p>
                <p className="text-xs text-muted-foreground">
                  Not configured yet. Only manual JSON backups are available.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download JSON Backup
            </CardTitle>
            <CardDescription>
              Export your tasks, wallet snapshot, and badges as a portable JSON file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              onClick={() => void handleExportJsonBundle()}
              disabled={jsonExportBusy || accountDataStepUpBlocks}
            >
              {jsonExportBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCode className="mr-2 h-4 w-4" />
              )}
              Download JSON backup
            </Button>
            <p className="text-xs text-muted-foreground">
              Filename includes the current date. Store this file somewhere safe.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restore from Backup
            </CardTitle>
            <CardDescription>
              Upload a previously downloaded JSON backup. Dry run is the default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-file" className="text-xs text-muted-foreground">
                AxTask user export (.json)
              </Label>
              <Input
                id="backup-file"
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleJsonFileSelect}
                disabled={accountJsonMutation.isPending || importChallengeBusy || accountDataStepUpBlocks}
              />
            </div>
            {jsonFileName ? (
              <p className="text-xs text-muted-foreground">
                Loaded: <span className="font-medium">{jsonFileName}</span>
                {jsonBundle?.metadata.tableCounts?.tasks != null
                  ? ` — ${Number(jsonBundle.metadata.tableCounts.tasks).toLocaleString()} tasks in bundle`
                  : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!jsonBundle || accountJsonMutation.isPending || importChallengeBusy || accountDataStepUpBlocks}
                onClick={() => void beginJsonAccountImport(true)}
              >
                {accountJsonMutation.isPending || importChallengeBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Dry run
              </Button>
              <Button
                type="button"
                disabled={!jsonBundle || accountJsonMutation.isPending || importChallengeBusy || accountDataStepUpBlocks}
                onClick={() => void beginJsonAccountImport(false)}
              >
                Import backup
              </Button>
            </div>
            {jsonAccountResult ? (
              <div
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  jsonAccountResult.success
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                }`}
              >
                <div className="font-medium">
                  {jsonAccountResult.dryRun ? "Dry run" : "Import"} —{" "}
                  {jsonAccountResult.success ? "completed" : "see errors"}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(jsonAccountResult.inserted || {}).map(([k, v]) => (
                    <div key={`ins-${k}`}>
                      <span className="text-muted-foreground">{k}: </span>
                      <span className="font-mono">{String(v)}</span>{" "}
                      {jsonAccountResult.dryRun ? "would insert" : "inserted"}
                    </div>
                  ))}
                  {Object.entries(jsonAccountResult.skipped || {}).some(([, v]) => v > 0) ? (
                    <div className="col-span-full text-amber-800 dark:text-amber-200">
                      Skipped rows (already present or unresolved links):{" "}
                      {Object.entries(jsonAccountResult.skipped || {})
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                    </div>
                  ) : null}
                </div>
                {jsonAccountResult.errors?.length ? (
                  <ul className="list-disc list-inside text-red-700 dark:text-red-300 max-h-32 overflow-y-auto">
                    {jsonAccountResult.errors.slice(0, 8).map((e, i) => (
                      <li key={i}>
                        {e.table} — {e.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            What the backup includes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Included</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Tasks</li>
                <li>Badge records</li>
                <li>Wallet snapshot metadata (balance, streaks, lifetime earned)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Not automatically restored</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Wallet balances</li>
                <li>Coin ledger state</li>
                <li>Anything intentionally protected by ledger safety rules</li>
              </ul>
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            On import, tasks are merged with fingerprint deduplication. Badges are merged when missing.
            Wallet snapshot metadata is included for reference but is not restored into the live ledger.
          </p>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A real import merges data into this account. Run a dry run first to preview changes.
            Duplicates are skipped using fingerprints.
          </p>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              This action cannot be undone. If you are unsure, keep your current JSON backup file safe before proceeding.
            </span>
          </div>
        </CardContent>
      </Card>

      <MfaVerificationPanel
        open={dataExportMfaOpen}
        challengeId={dataExportChallenge?.challengeId}
        codeEntryDisabled={!dataExportChallenge?.challengeId}
        purpose={MFA_PURPOSES.ACCOUNT_DATA_EXPORT}
        title="Verify for account backup"
        description={
          dataExportChallenge?.maskedDestination
            ? `Code sent to ${dataExportChallenge.maskedDestination}`
            : "Enter the code we email you."
        }
        expiresAt={dataExportChallenge?.expiresAt}
        devCode={dataExportChallenge?.devCode ?? null}
        isBusy={verifyDataExportStepUpMutation.isPending}
        onDismiss={() => {
          setDataExportMfaOpen(false);
          setDataExportChallenge(null);
        }}
        onResend={() => void startDataExportVerification()}
        onSubmitCode={async (code) => {
          const challengeId = dataExportChallenge?.challengeId;
          if (!challengeId) {
            toast({
              title: "Verification not ready",
              description: "Request a new code and try again.",
              variant: "destructive",
            });
            return;
          }
          await verifyDataExportStepUpMutation.mutateAsync({ challengeId, code });
        }}
      />

      {importOwnershipQuizOpen && importOwnershipQuizQuestions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg border shadow-lg max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Confirm ownership</h3>
            <p className="text-sm text-muted-foreground">
              Answer 1–3 quick questions about tasks in this backup to continue.
            </p>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {importOwnershipQuizQuestions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm font-medium">{q.prompt}</p>
                  <div className="grid gap-2">
                    {q.choices.map((choice, idx) => (
                      <Button
                        key={idx}
                        variant={importOwnershipQuizAnswers[q.id] === idx ? "default" : "outline"}
                        size="sm"
                        className="justify-start text-left h-auto py-2 px-3"
                        onClick={() =>
                          setImportOwnershipQuizAnswers((prev) => ({ ...prev, [q.id]: idx }))
                        }
                      >
                        {choice}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportOwnershipQuizOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitImportOwnershipQuiz} disabled={accountJsonMutation.isPending}>
                {accountJsonMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
