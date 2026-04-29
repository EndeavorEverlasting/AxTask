import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePretextSurface } from "@/hooks/use-pretext-surface";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bot, Play, Beaker } from "lucide-react";

export default function AdminAiReminderLabPage() {
  usePretextSurface("dense");
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<any>(null);

  const interpretMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/ai/interpret", { message });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => toast({ title: "Interpret failed", description: err.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/ai/execute", { message });
      return res.json();
    },
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => toast({ title: "Execute failed", description: err.message, variant: "destructive" }),
  });

  const intentType = result?.intent?.type ?? result?.intentType ?? result?.type ?? null;
  const clarification =
    result?.clarification ??
    result?.intent?.payload?.question ??
    null;
  const persistenceLane = result?.persistence ?? null;
  const taskReminderId = result?.taskReminderId ?? null;
  const reminderId = result?.reminderId ?? null;
  const triggerId = result?.triggerId ?? null;
  const provider = result?.meta?.provider ?? null;
  const model = result?.meta?.model ?? null;
  const latencyMs = typeof result?.meta?.latencyMs === "number" ? result.meta.latencyMs : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <PretextPageHeader
        eyebrow="Lab"
        title={
          <span className="inline-flex items-center gap-3">
            <Beaker className="h-7 w-7 text-primary" />
            AI Reminder Lab
          </span>
        }
        subtitle="Testing surface to isolate and debug the AI reminder interpreter and execution flows."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Input Prompt</CardTitle>
            <CardDescription>Enter a natural language reminder request</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <Textarea
              className="flex-1 min-h-[200px] resize-none font-mono text-sm"
              placeholder="e.g., Remind me to water the plants every 3 days starting tomorrow"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="flex items-center gap-3 justify-end mt-auto">
              <Button
                variant="outline"
                disabled={!prompt.trim() || interpretMutation.isPending || executeMutation.isPending}
                onClick={() => interpretMutation.mutate(prompt)}
              >
                {interpretMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                Interpret Only
              </Button>
              <Button
                disabled={!prompt.trim() || interpretMutation.isPending || executeMutation.isPending}
                onClick={() => executeMutation.mutate(prompt)}
              >
                {executeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Execute
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardDescription>Structured output from the orchestrator</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="mb-4 grid grid-cols-1 gap-2 rounded-md border bg-background p-3 text-xs sm:grid-cols-2">
              <div><span className="text-muted-foreground">Intent:</span> {intentType ?? "n/a"}</div>
              <div><span className="text-muted-foreground">Clarification:</span> {clarification ?? "n/a"}</div>
              <div><span className="text-muted-foreground">Persistence lane:</span> {persistenceLane ?? "n/a"}</div>
              <div><span className="text-muted-foreground">taskReminderId:</span> {taskReminderId ?? "n/a"}</div>
              <div><span className="text-muted-foreground">reminderId:</span> {reminderId ?? "n/a"}</div>
              <div><span className="text-muted-foreground">triggerId:</span> {triggerId ?? "n/a"}</div>
              <div><span className="text-muted-foreground">Provider:</span> {provider ?? "n/a"}</div>
              <div><span className="text-muted-foreground">Model:</span> {model ?? "n/a"}</div>
              <div><span className="text-muted-foreground">Latency:</span> {latencyMs != null ? `${latencyMs}ms` : "n/a"}</div>
            </div>
            <div className="flex-1 min-h-[300px] rounded-md border bg-muted/30 p-4 overflow-auto">
              {result ? (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                  {JSON.stringify(result, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
                  Run interpret or execute to see results
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
