import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { Video } from "lucide-react";

type InboxRow = {
  id: string;
  body: string;
  createdAt: string | null;
  readAt: string | null;
  taskId: string | null;
};

export default function CollabInboxPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/collaboration/inbox"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/collaboration/inbox");
      return r.json() as Promise<{ messages: InboxRow[] }>;
    },
  });

  const appendMutation = useMutation({
    mutationFn: async (body: string) => {
      const r = await apiRequest("POST", "/api/collaboration/inbox", { body });
      return r.json();
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/inbox"] });
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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collaboration inbox</h1>
          <p className="text-muted-foreground text-sm">
            Queue-style notes for coordination. Pair with a live session when you need it.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/huddle">
            <Video className="h-4 w-4 mr-2" />
            Video huddle
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add to your queue</CardTitle>
          <CardDescription>Visible only to you; use for handoffs and follow-ups.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Ping design when the API contract is ready…"
            rows={3}
          />
          <Button
            type="button"
            disabled={draft.trim().length === 0 || appendMutation.isPending}
            onClick={() => appendMutation.mutate(draft.trim())}
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
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${m.readAt ? "opacity-70" : "border-primary/30 bg-muted/30"}`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
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
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
