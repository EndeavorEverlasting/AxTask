import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gavel } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type AppealRow = {
  id: string;
  subjectType: string;
  subjectRef: string;
  title: string;
  body: string;
  status: string;
  createdAt: string | null;
  resolvedAt: string | null;
};

export default function AppealsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subjectType, setSubjectType] = useState<"account_ban" | "feedback_dispute" | "other">(
    "other",
  );
  const [subjectRef, setSubjectRef] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null);

  const { data: appeals = [], isLoading } = useQuery<AppealRow[]>({
    queryKey: ["/api/appeals"],
    enabled: Boolean(user),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (subjectType === "account_ban" && !user) {
        throw new Error("You must be signed in to appeal an account ban.");
      }
      const t = title.trim();
      const b = body.trim();
      if (t.length < 5 || b.length < 20) {
        throw new Error("Title must be at least 5 characters and details at least 20.");
      }
      const res = await apiRequest("POST", "/api/appeals", {
        subjectType,
        subjectRef: subjectType === "account_ban" ? user!.id : subjectRef.trim(),
        title: t,
        body: b,
      });
      return res.json() as Promise<AppealRow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appeals"] });
      setTitle("");
      setBody("");
      setSubjectRef("");
      toast({ title: "Appeal submitted", description: "Administrators will review it per voting rules." });
    },
    onError: (e: Error) =>
      toast({ title: "Could not submit", description: e.message, variant: "destructive" }),
  });

  const titleTrim = title.trim();
  const bodyTrim = body.trim();
  const titleValid = titleTrim.length >= 5;
  const bodyValid = bodyTrim.length >= 20;
  const formValid = titleValid && bodyValid;

  const withdrawMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/appeals/${id}/withdraw`, {});
    },
    onSuccess: () => {
      setPendingWithdrawId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/appeals"] });
      toast({ title: "Withdrawn", description: "Your appeal was withdrawn." });
    },
    onError: (e: Error) => {
      setPendingWithdrawId(null);
      toast({ title: "Withdraw failed", description: e.message, variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <p className="text-muted-foreground">Sign in to view or file appeals.</p>
        <Link href="/">
          <Button variant="link" className="px-0">Back home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/account">
          <Button variant="ghost" size="icon" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Gavel className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Appeals</h1>
          <p className="text-sm text-muted-foreground">
            Request review of a suspension or dispute feedback handling. Admins resolve appeals by vote
            (unanimous when two admins, two-thirds when three or more).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File an appeal</CardTitle>
          <CardDescription>
            Ban appeals apply only if your account is currently suspended. Feedback disputes require the
            security event id of your feedback submission (from support if needed).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={subjectType}
              onValueChange={(v) => setSubjectType(v as typeof subjectType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account_ban">Account suspension (ban)</SelectItem>
                <SelectItem value="feedback_dispute">Feedback / moderation dispute</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {subjectType === "feedback_dispute" ? (
            <div className="space-y-2">
              <Label htmlFor="subjectRef">Feedback event id</Label>
              <Input
                id="subjectRef"
                value={subjectRef}
                onChange={(e) => setSubjectRef(e.target.value)}
                placeholder="security event id (UUID)"
              />
            </div>
          ) : subjectType === "other" ? (
            <div className="space-y-2">
              <Label htmlFor="subjectRef">Reference</Label>
              <Input
                id="subjectRef"
                value={subjectRef}
                onChange={(e) => setSubjectRef(e.target.value)}
                placeholder="Short reference or id"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summary (min 5 characters)"
              aria-invalid={titleTrim.length > 0 && !titleValid}
            />
            {titleTrim.length > 0 && !titleValid && (
              <p className="text-xs text-destructive">Use at least 5 characters for the title.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Details</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Explain what you are appealing and why (min 20 characters)."
              rows={6}
              aria-invalid={bodyTrim.length > 0 && !bodyValid}
            />
            {bodyTrim.length > 0 && !bodyValid && (
              <p className="text-xs text-destructive">Use at least 20 characters in the details.</p>
            )}
          </div>
          <Button
            disabled={!formValid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Submit appeal
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your appeals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : appeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appeals yet.</p>
          ) : (
            appeals.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.title}</span>
                  <Badge variant="outline">{a.subjectType}</Badge>
                  <Badge variant={a.status === "open" ? "default" : "secondary"}>{a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{a.id}</p>
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                {a.status === "open" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingWithdrawId === a.id}
                    onClick={() => {
                      setPendingWithdrawId(a.id);
                      withdrawMutation.mutate(a.id);
                    }}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
