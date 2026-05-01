import { useEffect, useState } from "react";
import type { RouteComponentProps } from "wouter";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PublicTaskListItem } from "@shared/public-client-dtos";
import type { PublicConversionArtifact } from "@shared/public-client-dtos";
import { buildTaskListBundleHref } from "@/lib/task-list-route-filters";
import { postPaidDownload, triggerBlobDownload } from "@/lib/productivity-export-download";
import { Loader2, BarChart3, List, Lock, Undo2, Pencil } from "lucide-react";

export default function BundleDetailPage(props: RouteComponentProps<{ artifactId: string }>) {
  const { artifactId } = props.params;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [editTitle, setEditTitle] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/conversion-artifacts", artifactId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/conversion-artifacts/${artifactId}`);
      if (!r.ok) throw new Error("not found");
      return (await r.json()) as {
        artifact: PublicConversionArtifact;
        tasks: PublicTaskListItem[];
      };
    },
  });

  useEffect(() => {
    if (data?.artifact.title) setEditTitle(data.artifact.title);
  }, [data?.artifact.title]);

  const patchTitle = useMutation({
    mutationFn: async (title: string) => {
      const r = await apiFetch("PATCH", `/api/conversion-artifacts/${artifactId}`, { title });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { artifact: PublicConversionArtifact };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversion-artifacts", artifactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversion-artifacts"] });
      toast({ title: "Title updated" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (mode: "soft" | "hard") => {
      const r = await apiFetch("POST", `/api/conversion-artifacts/${artifactId}/undo`, { mode });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as { restoredDraft?: { activity: string; notes: string } };
    },
    onSuccess: (body, mode) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversion-artifacts"] });
      if (mode === "soft" && body?.restoredDraft) {
        toast({ title: "Bundle undone", description: "Draft fields returned — paste into a new task if needed." });
      } else {
        toast({ title: "Bundle removed" });
        setLocation("/bundles");
      }
    },
  });

  const encryptMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await apiFetch("POST", `/api/conversion-artifacts/${artifactId}/encrypt`, { enabled });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversion-artifacts", artifactId] });
      toast({ title: "Encryption updated" });
    },
  });

  const exportBundle = async (format: "md" | "pdf" | "csv") => {
    const dl = await postPaidDownload(`/api/conversion-artifacts/${artifactId}/export`, { format });
    if (!dl.ok) {
      toast({
        title: "Export failed",
        description: dl.message ?? (dl.insufficientCoins ? "Not enough AxCoins" : "Error"),
        variant: "destructive",
      });
      return;
    }
    triggerBlobDownload(dl.blob, `bundle-export.${format}`, dl.filename);
  };

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading bundle…
      </div>
    );
  }

  const { artifact, tasks } = data;
  const done = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <PretextPageHeader
        eyebrow="Bundle"
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {artifact.title}
            <span className="text-xs font-normal capitalize px-2 py-0.5 rounded-full bg-muted">
              {artifact.conversionType.replace(/_/g, " ")}
            </span>
          </span>
        }
        subtitle={`${done}/${tasks.length} tasks completed`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/bundles">All bundles</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-2 w-full">
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Rename
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Input
                className="max-w-md"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={patchTitle.isPending}
                onClick={() => patchTitle.mutate(editTitle.trim() || artifact.title)}
              >
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <CardDescription className="mb-1">Original prompt</CardDescription>
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {artifact.encrypted && !artifact.originalActivity?.trim() && !artifact.originalNotes?.trim() ? (
                <span className="text-muted-foreground">Encrypted — plaintext hidden at rest.</span>
              ) : (
                <>
                  {artifact.originalActivity || "—"}
                  {artifact.originalNotes?.trim() ? `\n\n${artifact.originalNotes}` : ""}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link href={buildTaskListBundleHref(artifactId)}>
                <List className="h-4 w-4 mr-1" />
                View in tasks
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/planner?bundle=${encodeURIComponent(artifactId)}`}>
                <BarChart3 className="h-4 w-4 mr-1" />
                View as Gantt
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void exportBundle("md")}>
              Export MD
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void exportBundle("csv")}>
              Export CSV
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void exportBundle("pdf")}>
              Export PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => encryptMutation.mutate(!artifact.encrypted)}
              disabled={encryptMutation.isPending}
            >
              <Lock className="h-4 w-4 mr-1" />
              {artifact.encrypted ? "Decrypt vault" : "Encrypt at rest"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                if (window.confirm("Remove generated tasks and delete this bundle?")) {
                  undoMutation.mutate("hard");
                }
              }}
              disabled={undoMutation.isPending}
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Undo (hard)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => undoMutation.mutate("soft")}
              disabled={undoMutation.isPending}
            >
              Undo (keep draft text)
            </Button>
          </div>

          <div>
            <CardTitle className="text-base mb-2">Generated tasks</CardTitle>
            <ul className="divide-y rounded-md border">
              {tasks.map((t) => (
                <li key={t.id} className="p-2 text-sm flex justify-between gap-2">
                  <Link href={`/tasks?task=${encodeURIComponent(t.id)}`} className="hover:underline truncate">
                    {t.activity}
                  </Link>
                  <span className="text-muted-foreground shrink-0">{t.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
