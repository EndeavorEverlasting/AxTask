import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Paperclip, Upload, X, Image, FileText, Loader2, Maximize2 } from "lucide-react";
import { type TaskAttachment } from "@shared/schema";

interface AttachmentUploadProps {
  taskId: string;
  attachments: TaskAttachment[];
  onUpdate?: () => void;
}

export function AttachmentUpload({ taskId, attachments, onUpdate }: AttachmentUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      const headers: Record<string, string> = {};
      const csrfToken = getCsrfToken();
      if (csrfToken) headers["x-csrf-token"] = csrfToken;
      const response = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers,
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Files uploaded", description: "Attachments added to task." });
      onUpdate?.();
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest("DELETE", `/api/tasks/${taskId}/attachments/${attachmentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Attachment removed" });
      onUpdate?.();
    },
  });

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const valid = fileArray.filter(f => {
      if (f.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: `${f.name} exceeds 5MB limit.`, variant: "destructive" });
        return false;
      }
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(f.type)) {
        toast({ title: "Invalid file type", description: `${f.name} is not a supported image.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    if (valid.length > 0) {
      uploadMutation.mutate(valid);
    }
  }, [uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  if (attachments.length >= 3) {
    return (
      <div className="text-xs text-muted-foreground">
        Maximum attachments reached (3/3)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-gray-300 dark:border-gray-600 hover:border-primary/50"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadMutation.isPending ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Drop images here or click to browse
            </p>
            <p className="text-[10px] text-muted-foreground/70">
              JPEG, PNG, GIF, WebP up to 5MB ({3 - attachments.length} remaining)
            </p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface AttachmentListProps {
  attachments: TaskAttachment[];
  taskId?: string;
  editable?: boolean;
  compact?: boolean;
  onUpdate?: () => void;
}

export function AttachmentList({ attachments, taskId, editable = false, compact = false, onUpdate }: AttachmentListProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest("DELETE", `/api/tasks/${taskId}/attachments/${attachmentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Attachment removed" });
      onUpdate?.();
    },
  });

  if (!attachments || attachments.length === 0) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Paperclip className="h-3 w-3" />
        <span className="text-[10px]">{attachments.length}</span>
      </span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {attachments.map((att) => (
          <div key={att.id} className="relative group">
            {att.type === "image" ? (
              <div
                className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setLightboxSrc(att.path)}
              >
                <img
                  src={att.thumbnailPath || att.path}
                  alt={att.filename}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Maximize2 className="h-4 w-4 text-white" />
                </div>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-md border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            {editable && taskId && (
              <button
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(att.id);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!lightboxSrc} onOpenChange={() => setLightboxSrc(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt="Attachment"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AttachmentIndicator({ attachments }: { attachments: TaskAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;

  const imageCount = attachments.filter(a => a.type === "image").length;

  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      {imageCount > 0 && <Image className="h-3 w-3" />}
      {attachments.length}
    </span>
  );
}
