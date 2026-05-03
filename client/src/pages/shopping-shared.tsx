import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { RouteComponentProps } from "wouter";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useShoppingListLive } from "@/hooks/use-shopping-list-live";
import { computeShoppingListUnlocked } from "@shared/shopping-list-feature";
import type { SkillNodeDto } from "@/components/skill-tree/skill-tree-view";
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
import { Loader2, Users, Download } from "lucide-react";

type ListRow = {
  id: string;
  name: string;
  createdByUserId: string;
  myRole?: string;
};

type ItemRow = {
  id: string;
  listId: string;
  label: string;
  notes: string;
  purchased: boolean;
  sortOrder: number;
  createdByUserId: string;
  purchasedByUserId: string | null;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemberRow = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
};

export default function ShoppingSharedPage({ params }: RouteComponentProps<{ listId: string }>) {
  const listId = params.listId;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: avatarSkills = [] } = useQuery<SkillNodeDto[]>({
    queryKey: ["/api/gamification/avatar-skills"],
    enabled: Boolean(user),
  });
  const exportUnlocked = computeShoppingListUnlocked(avatarSkills);
  const { data: exportPrices } = useQuery<ProductivityExportPrices>({
    queryKey: ["/api/gamification/productivity-export-prices"],
    enabled: Boolean(user) && exportUnlocked,
  });

  const itemsKey = useMemo(() => ["/api/shopping-lists", listId, "items"] as const, [listId]);

  const { data: listMeta, isLoading: listLoading, isError: listError } = useQuery<ListRow & { myRole?: string }>({
    queryKey: ["/api/shopping-lists", listId],
    enabled: Boolean(user && listId),
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<ItemRow[]>({
    queryKey: [...itemsKey],
    enabled: Boolean(user && listId),
  });

  const { data: members = [] } = useQuery<MemberRow[]>({
    queryKey: ["/api/shopping-lists", listId, "members"],
    enabled: Boolean(user && listId),
  });

  useShoppingListLive(listId, Boolean(user && listId && listMeta));

  const canEdit = listMeta?.myRole === "owner" || listMeta?.myRole === "editor";
  const isOwner = listMeta?.myRole === "owner";

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists", listId] });
    void queryClient.invalidateQueries({ queryKey: [...itemsKey] });
    void queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists", listId, "members"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
  }, [listId, itemsKey, queryClient]);

  const addItemMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/shopping-lists/${listId}/items`, { label: newLabel.trim(), notes: "" });
    },
    onSuccess: () => {
      setNewLabel("");
      invalidateAll();
    },
    onError: () => {
      toast({ title: "Could not add item", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (row: ItemRow) => {
      await apiRequest("PATCH", `/api/shopping-lists/${listId}/items/${row.id}`, {
        purchased: !row.purchased,
      });
    },
    onSuccess: () => invalidateAll(),
    onError: () => toast({ title: "Could not update item", variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/shopping-lists/${listId}/members`, {
        email: inviteEmail.trim(),
        role: "editor",
      });
    },
    onSuccess: () => {
      setInviteEmail("");
      invalidateAll();
      toast({ title: "Member invited" });
    },
    onError: async (e: Error) => {
      toast({ title: "Invite failed", description: e.message, variant: "destructive" });
    },
  });

  const runExport = useCallback(
    async (kind: "html" | "pdf" | "csv" | "xlsx") => {
      setBusy(kind);
      try {
        const path =
          kind === "html"
            ? `/api/shopping-lists/${listId}/export/html`
            : kind === "pdf"
              ? `/api/shopping-lists/${listId}/export/pdf`
              : `/api/shopping-lists/${listId}/export/spreadsheet`;
        const body = kind === "csv" || kind === "xlsx" ? { format: kind } : {};
        const result = await postPaidDownload(path, body);
        if (!result.ok) {
          if (result.status === 403) {
            toast({
              title: "Skill locked",
              description: result.message || "Unlock Dendritic List Sense for exports.",
              variant: "destructive",
            });
            return;
          }
          toast({ title: "Export failed", description: result.message, variant: "destructive" });
          return;
        }
        const day = new Date().toISOString().split("T")[0];
        const fallback =
          kind === "html"
            ? `axtask-shared-shopping-${day}.html`
            : kind === "pdf"
              ? `axtask-shared-shopping-${day}.pdf`
              : `axtask-shared-shopping-${day}.${kind}`;
        triggerBlobDownload(result.blob, fallback, result.filename);
        void queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
        toast({ title: "Download started" });
      } catch {
        toast({ title: "Export failed", variant: "destructive" });
      } finally {
        setBusy(null);
      }
    },
    [listId, queryClient, toast],
  );

  if (!user) {
    return (
      <div className="container max-w-2xl py-8">
        <PretextPageHeader
          eyebrow="Collaboration"
          title={
            <span className="inline-flex items-center gap-2">
              <Users className="h-7 w-7 text-muted-foreground shrink-0" aria-hidden />
              Shared shopping list
            </span>
          }
        />
        <p className="text-muted-foreground mt-4">
          <Link href="/login" className="text-primary underline">
            Sign in
          </Link>{" "}
          to open this list.
        </p>
      </div>
    );
  }

  if (listLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (listError || !listMeta?.id) {
    return (
      <div className="container max-w-2xl py-8">
        <PretextPageHeader
          eyebrow="Collaboration"
          title={
            <span className="inline-flex items-center gap-2">
              <Users className="h-7 w-7 text-muted-foreground shrink-0" aria-hidden />
              Shared shopping list
            </span>
          }
        />
        <p className="text-muted-foreground mt-4">You do not have access to this list, or it does not exist.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/shopping">Back to shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <PretextPageHeader
        eyebrow="Collaboration"
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="h-7 w-7 text-primary shrink-0" aria-hidden />
            {listMeta.name}
          </span>
        }
        subtitle="Live shared list — changes sync for everyone on this page."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/shopping">All shopping</Link>
            </Button>
            {exportUnlocked ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={Boolean(busy) || items.length === 0}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span className="ml-2">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void runExport("html")}>
                    HTML {exportPrices?.shoppingListExport != null ? `(${exportPrices.shoppingListExport}c)` : ""}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void runExport("csv")}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void runExport("xlsx")}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void runExport("pdf")}>PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      />

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add item</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input
              placeholder="Milk, bread, …"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="max-w-md"
              onKeyDown={(e) => {
                if (e.key === "Enter") addItemMutation.mutate();
              }}
            />
            <Button disabled={!newLabel.trim() || addItemMutation.isPending} onClick={() => addItemMutation.mutate()}>
              Add
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
          <CardDescription>
            {itemsLoading ? "Loading…" : `${items.length} line${items.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-3 transition-colors",
                    row.purchased && "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                  )}
                >
                  <Checkbox
                    checked={row.purchased}
                    disabled={!canEdit || toggleMutation.isPending}
                    onCheckedChange={() => toggleMutation.mutate(row)}
                    className={cn("mt-1", row.purchased && "border-emerald-600 data-[state=checked]:bg-emerald-600")}
                    aria-label={row.purchased ? `Mark not purchased: ${row.label}` : `Mark purchased: ${row.label}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={cn("font-medium", row.purchased && "line-through opacity-90")}>{row.label}</div>
                    {row.notes?.trim() ? (
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{row.notes}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite collaborator</CardTitle>
            <CardDescription>Editors can add lines and toggle purchased.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="max-w-md"
            />
            <Button
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              Invite
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1">
            {members.map((m) => (
              <li key={m.userId} className="flex justify-between gap-2">
                <span>{m.displayName || m.email}</span>
                <span className="text-muted-foreground">{m.role}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
