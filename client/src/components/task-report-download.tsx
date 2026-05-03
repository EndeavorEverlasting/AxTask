import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { postPaidDownload, triggerBlobDownload, type ProductivityExportPrices } from "@/lib/productivity-export-download";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileBarChart, Loader2, Coins } from "lucide-react";

interface TaskReportDownloadProps {
  taskId: string;
  activityPreview: string;
}

export function TaskReportDownload({ taskId, activityPreview }: TaskReportDownloadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);

  const { data: exportPrices } = useQuery<ProductivityExportPrices>({
    queryKey: ["/api/gamification/productivity-export-prices"],
  });

  const run = async (format: "pdf" | "xlsx") => {
    setBusy(format);
    try {
      const result = await postPaidDownload(`/api/tasks/${taskId}/report`, { format });
      if (!result.ok) {
        if (result.insufficientCoins) {
          toast({
            title: "Not enough AxCoins",
            description:
              result.insufficientCoins.message
              ?? `Need ${result.insufficientCoins.required} coins (balance ${result.insufficientCoins.balance}).`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Download failed",
            description: result.message || "Could not generate the task report.",
            variant: "destructive",
          });
        }
        return;
      }
      const short = taskId.slice(0, 8);
      const slug = activityPreview
        .slice(0, 40)
        .replace(/[^\w-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "") || "report";
      const fallback =
        format === "pdf" ? `AxTask-Report-${short}-${slug}.pdf` : `AxTask-Report-${short}-${slug}.xlsx`;
      triggerBlobDownload(result.blob, fallback, result.filename);
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      toast({ title: "Report downloaded", description: `${format.toUpperCase()} saved to your device.` });
    } catch {
      toast({
        title: "Download failed",
        description: "Could not generate the task report.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const pdfCost = exportPrices?.taskReportPdf;
  const xlsxCost = exportPrices?.taskReportXlsx;
  const freeDev = exportPrices?.freeInDev;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
          Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {freeDev ? (
          <p className="text-xs text-muted-foreground px-2 py-1.5">Free in local dev</p>
        ) : (
          <p className="text-xs text-muted-foreground px-2 py-1.5 flex items-center gap-1">
            <Coins className="h-3 w-3 text-amber-600 shrink-0" />
            PDF {pdfCost ?? "…"} · Excel {xlsxCost ?? "…"} coins
          </p>
        )}
        <DropdownMenuItem disabled={busy !== null} onSelect={() => void run("pdf")}>
          Download PDF report
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy !== null} onSelect={() => void run("xlsx")}>
          Download Excel report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
