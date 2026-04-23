import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { TaskListHost } from "@/components/task-list-host";
import { Download, Loader2, Lock, ShoppingCart, Users } from "lucide-react";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { computeShoppingListUnlocked } from "@shared/shopping-list-feature";
import type { SkillNodeDto } from "@/components/skill-tree/skill-tree-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  postPaidDownload,
  triggerBlobDownload,
  type ProductivityExportPrices,
} from "@/lib/productivity-export-download";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";

/**
 * Shopping list surface — `TaskListHost` `variant="shopping"`. Gated by the
 * Dendritic List Sense avatar skill; exports require the same unlock (403 on API).
 */
type SharedListBrief = { id: string; name: string };

export default function ShoppingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: avatarSkills = [] } = useQuery<SkillNodeDto[]>({
    queryKey: ["/api/gamification/avatar-skills"],
    enabled: Boolean(user),
  });
  const unlocked = computeShoppingListUnlocked(avatarSkills);
  const { data: exportPrices } = useQuery<ProductivityExportPrices>({
    queryKey: ["/api/gamification/productivity-export-prices"],
    enabled: Boolean(user) && unlocked,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [newSharedName, setNewSharedName] = useState("");

  const { data: sharedLists = [] } = useQuery<SharedListBrief[]>({
    queryKey: ["/api/shopping-lists"],
    enabled: Boolean(user && unlocked),
  });

  const createSharedListMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/shopping-lists", { name });
      return (await res.json()) as SharedListBrief;
    },
    onSuccess: (data) => {
      setNewSharedName("");
      void queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
      setLocation(`/shopping/shared/${data.id}`);
    },
    onError: (e: Error) => {
      toast({
        title: "Could not create shared list",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const runExport = useCallback(
    async (kind: "html" | "pdf" | "csv" | "xlsx") => {
      setBusy(kind);
      try {
        const path =
          kind === "html"
            ? "/api/tasks/export/shopping-list/html"
            : kind === "pdf"
              ? "/api/tasks/export/shopping-list/pdf"
              : "/api/tasks/export/shopping-list/spreadsheet";
        const body = kind === "csv" || kind === "xlsx" ? { format: kind } : {};
        const result = await postPaidDownload(path, body);
        if (!result.ok) {
          if (result.status === 403) {
            toast({
              title: "Skill locked",
              description: result.message || "Unlock Dendritic List Sense in the skill tree first.",
              variant: "destructive",
            });
            return;
          }
          if (result.insufficientCoins) {
            toast({
              title: "Not enough AxCoins",
              description:
                result.insufficientCoins.message
                ?? `Need ${result.insufficientCoins.required} coins (balance ${result.insufficientCoins.balance}).`,
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Export failed",
            description: result.message || "Could not export.",
            variant: "destructive",
          });
          return;
        }
        const day = new Date().toISOString().split("T")[0];
        const fallback =
          kind === "html"
            ? `axtask-shopping-list-${day}.html`
            : kind === "pdf"
              ? `axtask-shopping-list-${day}.pdf`
              : `axtask-shopping-list-${day}.${kind}`;
        triggerBlobDownload(result.blob, fallback, result.filename);
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
        toast({ title: "Download started", description: `Saved as ${fallback}.` });
      } catch {
        toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
      } finally {
        setBusy(null);
      }
    },
    [queryClient, toast],
  );

  if (user && !unlocked) {
    return (
      <div className="p-4 md:p-6 space-y-6 md:space-y-8 max-w-lg mx-auto">
        <PretextPageHeader
          eyebrow="Errands"
          title={
            <span className="inline-flex items-center gap-2">
              <Lock className="h-7 w-7 text-muted-foreground shrink-0" aria-hidden />
              Shopping list
            </span>
          }
          subtitle="Unlock the dendritic skill node to open the dedicated shopping list workspace and checklist exports."
        />
        <Card>
          <CardHeader>
            <CardTitle>Dendritic List Sense</CardTitle>
            <CardDescription>
              Found under the dendritic branch on the avatar skill tree. Requires Export Efficiency first, then spend
              AxCoins to activate.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/skill-tree">
              <Button>Open skill tree</Button>
            </Link>
            <Link href="/tasks">
              <Button variant="outline">Back to all tasks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const coinHint =
    exportPrices && !exportPrices.freeInDev && exportPrices.shoppingListExport > 0
      ? `${exportPrices.shoppingListExport} AxCoins per download (export discounts apply).`
      : undefined;

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      <PretextPageHeader
        eyebrow="Errands"
        title={
          <span className="inline-flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary shrink-0" aria-hidden />
            Shopping list
          </span>
        }
        subtitle="Check items off as you buy them. Voice can add line items as tasks; marking an item purchased completes that task."
        actions={
          unlocked ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={busy !== null}
                  title={coinHint}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  Export…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem disabled={busy !== null} onSelect={() => void runExport("html")}>
                  Checkable HTML
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy !== null} onSelect={() => void runExport("csv")}>
                  Spreadsheet (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy !== null} onSelect={() => void runExport("xlsx")}>
                  Spreadsheet (Excel)
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy !== null} onSelect={() => void runExport("pdf")}>
                  PDF checklist
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden />
            Shared lists (live)
          </CardTitle>
          <CardDescription>
            Household or team lists with instant sync. Creating a list requires Dendritic List Sense; invited members can
            open the list without the skill.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="New list name…"
              value={newSharedName}
              onChange={(e) => setNewSharedName(e.target.value)}
              className="max-w-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSharedName.trim()) createSharedListMutation.mutate(newSharedName.trim());
              }}
            />
            <Button
              type="button"
              disabled={!newSharedName.trim() || createSharedListMutation.isPending}
              onClick={() => createSharedListMutation.mutate(newSharedName.trim())}
            >
              Create shared list
            </Button>
          </div>
          {sharedLists.length > 0 ? (
            <ul className="text-sm space-y-1">
              {sharedLists.map((l) => (
                <li key={l.id}>
                  <Link href={`/shopping/shared/${l.id}`} className="text-primary underline font-medium">
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No shared lists yet.</p>
          )}
        </CardContent>
      </Card>
      <TaskListHost variant="shopping" />
    </div>
  );
}
