import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parseApiRequestError, participationAgeUserHint } from "@/lib/parse-api-request-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Video } from "lucide-react";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { PasteComposer, type PasteComposerValue } from "@/components/composer/paste-composer";
import { SafeMarkdown } from "@/lib/safe-markdown";
import { usePretextSurface } from "@/hooks/use-pretext-surface";

type InboxRow = {
  id: string;
  body: string;
  createdAt: string | null;
  readAt: string | null;
  taskId: string | null;
  attachments?: Array<{ id: string }>;
};

const EMPTY: PasteComposerValue = { body: "", attachmentAssetIds: [] };

export default function CollabInboxPage() {
  usePretextSurface("dense");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PasteComposerValue>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/collaboration/inbox"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/collaboration/inbox");
      return r.json() as Promise<{ messages: InboxRow[] }>;
    },
  });

  const appendMutation = useMutation({
    mutationFn: async (payload: PasteComposerValue) => {
      const r = await apiRequest("POST", "/api/collaboration/inbox", {
        body: payload.body,
        attachmentAssetIds: payload.attachmentAssetIds,
      });
      return r.json();
    },
    onSuccess: () => {
      setDraft(EMPTY);
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/inbox"] });
    },
    onError: (err: Error) => {
      const p = parseApiRequestError(err);
      toast({
        title: "Could not enqueue",
        description: p.message + participationAgeUserHint(p.code),
        variant: "destructive",
      });
    },
  });

  const readMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/collaboration/inbox/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/inbox"] });
    },
  });

  const messages = data?.messages ?? [];
  const canSend = useMemo(
    () =>
      (draft.body.trim().length > 0 || draft.attachmentAssetIds.length > 0) &&
      !appendMutation.isPending,
    [draft, appendMutation.isPending],
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <PretextPageHeader
        eyebrow="Collaboration"
        title="Collaboration inbox"
        subtitle="Queue-style notes for coordination. Paste screenshots, GIFs, or just a quick follow-up."
        actions={
          <Button variant="outline" asChild>
            <Link href="/huddle">
              <Video className="h-4 w-4 mr-2" />
              Video huddle
            </Link>
          </Button>
        }
      />

      <Card className="glass-panel-glossy">
        <CardHeader>
          <CardTitle>Add to your queue</CardTitle>
          <CardDescription>
            Paste images or GIFs directly - they stay private to you. Markdown (`**bold**`,
            `[link](https://…)`) is rendered safely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <PasteComposer
            value={draft}
            onChange={setDraft}
            placeholder="e.g. Ping design when the API contract is ready…"
            ariaLabel="Collaboration inbox note"
            kind="collab_inbox"
            maxBodyLength={8000}
            maxAttachments={8}
            textareaClassName="min-h-[80px]"
          />
          <Button
            type="button"
            disabled={!canSend}
            onClick={() => appendMutation.mutate(draft)}
          >
            {appendMutation.isPending ? "Saving…" : "Enqueue"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>{isLoading ? "Loading…" : `${messages.length} item(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Nothing queued yet.</p>
          )}
          {messages.map((m) => {
            const allowedIds = new Set((m.attachments ?? []).map((a) => a.id));
            return (
              <div
                key={m.id}
                className={`rounded-lg border p-3 text-sm ${m.readAt ? "opacity-70" : "border-primary/30 bg-muted/30"}`}
              >
                <SafeMarkdown source={m.body} allowedAttachmentIds={allowedIds} />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</span>
                  {m.taskId && <span className="font-mono">task {m.taskId.slice(0, 8)}…</span>}
                  {!m.readAt && (
                    <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => readMutation.mutate(m.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
