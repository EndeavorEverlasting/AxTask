import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Camera, Inbox, Send, Trash2 } from "lucide-react";

type ScreenshotMeta = {
  fileName: string;
  mimeType: string;
  byteSize: number;
};

export default function FeedbackPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [screenshots, setScreenshots] = useState<ScreenshotMeta[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const totalBytes = useMemo(() => screenshots.reduce((acc, cur) => acc + cur.byteSize, 0), [screenshots]);

  const pushFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ fileName: f.name, mimeType: f.type, byteSize: f.size }));
    if (incoming.length === 0) {
      toast({
        title: "No images detected",
        description: "Paste, drag, or drop screenshot image files.",
        variant: "destructive",
      });
      return;
    }
    setScreenshots((prev) => [...prev, ...incoming].slice(0, 10));
  }, [toast]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/feedback", {
        message,
        screenshotMeta: screenshots,
      });
    },
    onSuccess: () => {
      toast({ title: "Feedback sent", description: "Thanks — your feedback has been recorded." });
      setMessage("");
      setScreenshots([]);
    },
    onError: (err: Error) => {
      toast({ title: "Feedback failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Feedback & Screenshots</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Paste, drag, or drop screenshots directly into this form for richer bug reports.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tell us what happened</CardTitle>
          <CardDescription>Include steps, expected behavior, and actual behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue, idea, or request..."
            className="min-h-[150px]"
          />

          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragActive(false);
              pushFiles(e.dataTransfer.files);
            }}
            onPaste={(e) => {
              const clipboardFiles = e.clipboardData.files;
              if (clipboardFiles && clipboardFiles.length > 0) {
                pushFiles(clipboardFiles);
              }
            }}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition ${
              isDragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-700"
            }`}
          >
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
            <p className="font-medium">Paste or drag screenshots here</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Up to 10 images, max 10MB each</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {screenshots.length} screenshot(s)
            </Badge>
            <Badge variant="outline">{(totalBytes / 1024 / 1024).toFixed(2)} MB</Badge>
          </div>

          {screenshots.length > 0 && (
            <div className="space-y-2">
              {screenshots.map((shot, idx) => (
                <div key={`${shot.fileName}-${idx}`} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="truncate">
                    <span className="font-medium">{shot.fileName}</span>
                    <span className="ml-2 text-gray-500">{(shot.byteSize / 1024).toFixed(1)} KB</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full sm:w-auto"
            disabled={message.trim().length < 5 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="mr-2 h-4 w-4" />
            {submitMutation.isPending ? "Sending..." : "Submit Feedback"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
