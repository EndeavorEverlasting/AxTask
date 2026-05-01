import { useEffect, useMemo, useState } from "react";
import type { StructuredPromptDetection } from "@shared/shopping-tasks";
import type { ConversionArtifactType } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ConversionArtifactPreviewProps {
  open: boolean;
  detection: StructuredPromptDetection;
  originalActivity: string;
  originalNotes: string;
  onCancel: () => void;
  onConfirm: (payload: {
    conversionType: ConversionArtifactType;
    title: string;
    items: string[];
  }) => void;
}

const TYPE_OPTIONS: { id: ConversionArtifactType; label: string }[] = [
  { id: "shopping_list", label: "Shopping list" },
  { id: "checklist", label: "Checklist" },
  { id: "project_plan", label: "Project plan" },
  { id: "gantt_plan", label: "Gantt plan" },
];

export function ConversionArtifactPreview({
  open,
  detection,
  originalActivity,
  originalNotes,
  onCancel,
  onConfirm,
}: ConversionArtifactPreviewProps) {
  const defaultType = useMemo((): ConversionArtifactType => {
    const c = detection.conversionCandidates;
    if (c.includes("shopping_list")) return "shopping_list";
    if (c.includes("checklist")) return "checklist";
    if (c.includes("project_plan")) return "project_plan";
    return "gantt_plan";
  }, [detection.conversionCandidates]);

  const [conversionType, setConversionType] = useState<ConversionArtifactType>(defaultType);
  const [title, setTitle] = useState(
    () => originalActivity.trim().slice(0, 120) || "Task bundle",
  );
  const [items, setItems] = useState<string[]>(() =>
    detection.items.length ? [...detection.items] : [""],
  );

  useEffect(() => {
    if (!open) return;
    setConversionType(defaultType);
    setTitle(originalActivity.trim().slice(0, 120) || "Task bundle");
    setItems(detection.items.length ? [...detection.items] : [""]);
  }, [open, defaultType, originalActivity, detection.items]);

  const linesText = items.join("\n");

  const setFromTextarea = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((l) => l.trimEnd());
    setItems(lines.length ? lines : [""]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create task bundle</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Confidence {(detection.confidence * 100).toFixed(0)}% · {detection.format.replace(/_/g, " ")}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bundle name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label>Conversion type</Label>
            <RadioGroup
              value={conversionType}
              onValueChange={(v) => setConversionType(v as ConversionArtifactType)}
              className="grid gap-2"
            >
              {TYPE_OPTIONS.map((opt) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.id} id={`conv-${opt.id}`} />
                  <Label htmlFor={`conv-${opt.id}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Line items</Label>
            <Textarea
              value={linesText}
              onChange={(e) => setFromTextarea(e.target.value)}
              rows={Math.min(12, Math.max(4, items.length + 2))}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">One row per task. Blank lines are ignored on save.</p>
          </div>

          <div className={cn("rounded-md border p-2 text-xs text-muted-foreground space-y-1")}>
            <p className="font-medium text-foreground">Original prompt (preserved in bundle)</p>
            <p className="whitespace-pre-wrap">{originalActivity || "—"}</p>
            {originalNotes?.trim() ? (
              <p className="whitespace-pre-wrap border-t pt-2 mt-2">{originalNotes}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const cleaned = items.map((s) => s.trim()).filter((s) => s.length > 0);
              if (cleaned.length === 0) return;
              onConfirm({
                conversionType,
                title: title.trim() || "Task bundle",
                items: cleaned,
              });
            }}
          >
            Create bundle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
