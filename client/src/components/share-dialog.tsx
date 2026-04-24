import { useState, useEffect, useMemo, useRef, useCallback, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncRawTaskRequest } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { useMfaChallenge } from "@/hooks/use-mfa-challenge";
import { MfaVerificationPanel } from "@/components/mfa/mfa-verification-panel";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Trash2, Crown, Eye, Pencil, Globe2, CheckCircle2, Search } from "lucide-react";
interface Collaborator {
  id: string;
  taskId: string;
  userId: string;
  role: string;
  publicHandle: string;
  displayName: string | null;
  invitedAt: string;
}

interface ShareDialogProps {
  taskId: string;
  isOwner: boolean;
  visibility?: string;
  communityShowNotes?: boolean;
}

type InvitePreviewResponse = {
  found: boolean;
  preview?: {
    publicHandle: string;
    displayName: string | null;
    profileImageUrl: string | null;
  };
};

type InvitePreviewUser = NonNullable<InvitePreviewResponse["preview"]>;

export function ShareDialog({ taskId, isOwner, visibility = "private", communityShowNotes = false }: ShareDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: sessionUser } = useAuth();
  const { requestChallenge, isRequesting: mfaSending } = useMfaChallenge();
  const [handle, setHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [role, setRole] = useState("viewer");
  const [invitePulse, setInvitePulse] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(communityShowNotes);
  useEffect(() => {
    setShowNotes(communityShowNotes);
  }, [communityShowNotes]);
  const [pubMfaOpen, setPubMfaOpen] = useState(false);
  const [unpubMfaOpen, setUnpubMfaOpen] = useState(false);
  const [pubChallenge, setPubChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    maskedDestination?: string;
  } | null>(null);
  const [unpubChallenge, setUnpubChallenge] = useState<typeof pubChallenge | null>(null);
  const [debouncedHandle, setDebouncedHandle] = useState("");
  const [highlightUserId, setHighlightUserId] = useState<string | null>(null);
  const [suggestActiveIndex, setSuggestActiveIndex] = useState(-1);
  const inviteInputWrapRef = useRef<HTMLDivElement>(null);

  const normalizedHandle = useMemo(() => handle.trim().replace(/^@+/, "").toLowerCase(), [handle]);
  const isHandleStructurallyValid = normalizedHandle.length > 0 && !/\s/.test(normalizedHandle);

  useEffect(() => {
    if (!open) {
      setDebouncedHandle("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedHandle(normalizedHandle), 220);
    return () => window.clearTimeout(t);
  }, [normalizedHandle, open]);

  useEffect(() => {
    setSuggestActiveIndex(-1);
  }, [debouncedHandle]);

  useEffect(() => {
    if (!invitePulse) return;
    const t = window.setTimeout(() => setInvitePulse(null), 2200);
    return () => window.clearTimeout(t);
  }, [invitePulse]);

  useEffect(() => {
    if (!highlightUserId) return;
    const t = window.setTimeout(() => setHighlightUserId(null), 2600);
    return () => window.clearTimeout(t);
  }, [highlightUserId]);

  const previewQuery = useQuery<InvitePreviewResponse>({
    queryKey: ["/api/invites/preview", debouncedHandle],
    enabled: isOwner && open && debouncedHandle.length >= 2 && isHandleStructurallyValid,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await fetch("/api/invites/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: debouncedHandle }),
      });
      if (!res.ok) throw new Error("Could not verify handle");
      return res.json();
    },
  });

  const suggestionsQuery = useQuery<{ suggestions: InvitePreviewUser[] }>({
    queryKey: ["/api/invites/handle-suggestions", debouncedHandle],
    enabled: isOwner && open && debouncedHandle.length >= 2 && isHandleStructurallyValid,
    staleTime: 15_000,
    queryFn: async () => {
      const u = new URL("/api/invites/handle-suggestions", window.location.origin);
      u.searchParams.set("query", debouncedHandle);
      const res = await fetch(`${u.pathname}${u.search}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load suggestions");
      return res.json();
    },
  });

  const recentQuery = useQuery<{ recent: InvitePreviewUser[] }>({
    queryKey: ["/api/invites/recent-collaborators"],
    enabled: isOwner && open,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/invites/recent-collaborators", { credentials: "include" });
      if (!res.ok) return { recent: [] };
      return res.json();
    },
  });

  const { data: collaborators = [] } = useQuery<Collaborator[]>({
    queryKey: ["/api/tasks", taskId, "collaborators"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/collaborators`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30_000,
  });

  const existingHandles = useMemo(
    () => new Set(collaborators.map((c) => c.publicHandle.toLowerCase())),
    [collaborators],
  );

  const recentChips = useMemo(() => {
    const list = recentQuery.data?.recent ?? [];
    const selfHandle = sessionUser?.publicHandle?.toLowerCase() ?? null;
    return list.filter((r) => {
      if (existingHandles.has(r.publicHandle.toLowerCase())) return false;
      if (selfHandle && r.publicHandle.toLowerCase() === selfHandle) return false;
      return true;
    });
  }, [recentQuery.data?.recent, existingHandles, sessionUser?.publicHandle]);

  const applySuggestion = useCallback((publicHandle: string) => {
    const h = publicHandle.trim().toLowerCase();
    setHandle(h ? `@${h}` : "");
    setSuggestActiveIndex(-1);
    setHandleError(null);
  }, []);

  const addMutation = useMutation({
    mutationFn: async ({ handle, role }: { handle: string; role: string }) => {
      return syncRawTaskRequest(
        "POST",
        `/api/tasks/${taskId}/collaborators`,
        { handle, role },
        queryClient,
      );
    },
    onSuccess: (data, { handle }) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({ title: "Queued", description: "Invite will sync when you're online." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invites/recent-collaborators"] });
      const collab = data as { userId?: string } | undefined;
      if (collab?.userId) setHighlightUserId(collab.userId);
      setHandle("");
      setInvitePulse(`Orb sync complete: @${handle.replace(/^@+/, "")} joined as ${role}.`);
      toast({ title: "Collaborator added", description: `@${handle.replace(/^@+/, "")} can now access this task.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      return syncRawTaskRequest("DELETE", `/api/tasks/${taskId}/collaborators/${userId}`, undefined, queryClient);
    },
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({ title: "Queued", description: "Removal will sync when you're online." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      toast({ title: "Collaborator removed" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      toast({
        title: "Failed to remove collaborator",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return syncRawTaskRequest(
        "PUT",
        `/api/tasks/${taskId}/collaborators/${userId}`,
        { role },
        queryClient,
      );
    },
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({ title: "Queued", description: "Role change will sync when you're online." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
    },
    onError: (err: Error) => {
      console.error("update collaborator role failed", err);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      toast({
        title: "Failed to update role",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const roleIcon = (r: string) => {
    if (r === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (r === "editor") return <Pencil className="h-3.5 w-3.5 text-blue-500" />;
    return <Eye className="h-3.5 w-3.5 text-gray-500" />;
  };

  const inviteReady = isHandleStructurallyValid
    && normalizedHandle.length > 0
    && !addMutation.isPending
    && !previewQuery.isFetching
    && Boolean(previewQuery.data?.found);

  const submitInvite = () => {
    if (!isHandleStructurallyValid || !normalizedHandle) {
      setHandleError("Enter a valid handle (no spaces)");
      return;
    }
    if (previewQuery.data?.found === false) {
      setHandleError("No user found for that handle");
      return;
    }
    setHandleError(null);
    addMutation.mutate({ handle: normalizedHandle, role });
  };

  const suggestionList = suggestionsQuery.data?.suggestions ?? [];
  const showSuggestPanel =
    isOwner
    && open
    && debouncedHandle.length >= 2
    && isHandleStructurallyValid
    && (suggestionsQuery.isFetching || suggestionsQuery.isSuccess);

  const onInviteInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const list = suggestionList;
    if (showSuggestPanel && list.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestActiveIndex((i) => (i < 0 ? 0 : Math.min(list.length - 1, i + 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestActiveIndex((i) => (i <= 0 ? -1 : i - 1));
        return;
      }
      if (e.key === "Enter" && suggestActiveIndex >= 0 && suggestActiveIndex < list.length) {
        e.preventDefault();
        applySuggestion(list[suggestActiveIndex]!.publicHandle);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestActiveIndex(-1);
        return;
      }
    }
    if (e.key === "Enter") {
      if (!inviteReady) return;
      e.preventDefault();
      submitInvite();
    }
  };

  const publishMutation = useMutation({
    mutationFn: async ({ challengeId, code }: { challengeId: string; code: string }) => {
      return syncRawTaskRequest(
        "POST",
        `/api/tasks/${taskId}/community/publish`,
        { challengeId, code, communityShowNotes: showNotes },
        queryClient,
      );
    },
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({ title: "Queued", description: "Publish will sync when you're online." });
        return;
      }
      setPubMfaOpen(false);
      setPubChallenge(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Published", description: "This task is listed in Community (public)." });
    },
    onError: (err: Error) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const unpublishMutation = useMutation({
    mutationFn: async ({ challengeId, code }: { challengeId: string; code: string }) => {
      return syncRawTaskRequest(
        "POST",
        `/api/tasks/${taskId}/community/unpublish`,
        { challengeId, code },
        queryClient,
      );
    },
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({ title: "Queued", description: "Unpublish will sync when you're online." });
        return;
      }
      setUnpubMfaOpen(false);
      setUnpubChallenge(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Removed from community", description: "This task is private again." });
    },
    onError: (err: Error) => toast({ title: "Unpublish failed", description: err.message, variant: "destructive" }),
  });

  const startPublishMfa = async () => {
    const c = await requestChallenge({
      purpose: MFA_PURPOSES.COMMUNITY_PUBLISH_TASK,
      channel: "email",
      taskId,
    });
    setPubChallenge({
      challengeId: c.challengeId,
      expiresAt: c.expiresAt,
      devCode: c.devCode,
      maskedDestination: c.maskedDestination,
    });
    setPubMfaOpen(true);
    toast({ title: "Code sent", description: "Check your email for the verification code." });
  };

  const startUnpublishMfa = async () => {
    const c = await requestChallenge({
      purpose: MFA_PURPOSES.COMMUNITY_UNPUBLISH_TASK,
      channel: "email",
      taskId,
    });
    setUnpubChallenge({
      challengeId: c.challengeId,
      expiresAt: c.expiresAt,
      devCode: c.devCode,
      maskedDestination: c.maskedDestination,
    });
    setUnpubMfaOpen(true);
    toast({ title: "Code sent", description: "Check your email for the verification code." });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Users className="h-4 w-4" />
          Share
          {collaborators.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{collaborators.length}</Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Task
          </DialogTitle>
          <DialogDescription>
            Invite others to collaborate on this task in real-time
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="space-y-2">
            {recentChips.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Invite again</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentChips.map((r) => (
                    <Button
                      key={r.publicHandle}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-xs"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        applySuggestion(r.publicHandle);
                      }}
                    >
                      @{r.publicHandle}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <div className="relative flex-1" ref={inviteInputWrapRef}>
                <Input
                  placeholder="Enter @handle"
                  value={handle}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestPanel && suggestionList.length > 0}
                  onChange={(e) => {
                    setHandle(e.target.value);
                    if (handleError) setHandleError(null);
                  }}
                  onKeyDown={onInviteInputKeyDown}
                  className="flex-1"
                  aria-invalid={handleError ? true : undefined}
                />
                {showSuggestPanel ? (
                  <div
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                    role="listbox"
                  >
                    {suggestionsQuery.isFetching ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Scanning handles…</div>
                    ) : suggestionsQuery.isError ? (
                      <div className="px-3 py-2 text-xs text-destructive">Could not load suggestions.</div>
                    ) : suggestionList.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No matches — try another prefix.</div>
                    ) : (
                      suggestionList.map((s, idx) => (
                        <button
                          key={s.publicHandle}
                          type="button"
                          role="option"
                          aria-selected={suggestActiveIndex === idx}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60",
                            suggestActiveIndex === idx && "bg-muted/80",
                          )}
                          onMouseEnter={() => setSuggestActiveIndex(idx)}
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            applySuggestion(s.publicHandle);
                          }}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: stringToColor(s.publicHandle) }}
                          >
                            {(s.displayName || s.publicHandle).charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{s.displayName || `@${s.publicHandle}`}</span>
                            <span className="ml-1 text-muted-foreground">@{s.publicHandle}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={submitInvite}
                disabled={!inviteReady}
                size="icon"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {isOwner && normalizedHandle.length >= 2 ? (
          <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            {previewQuery.isFetching ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Search className="h-3.5 w-3.5 animate-pulse" />
                Looking for @{normalizedHandle}…
              </div>
            ) : previewQuery.data?.found && previewQuery.data.preview ? (
              <div className="flex items-center gap-2">
                <div
                  className="h-6 w-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                  style={{ backgroundColor: stringToColor(previewQuery.data.preview.publicHandle) }}
                >
                  {(previewQuery.data.preview.displayName || previewQuery.data.preview.publicHandle).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {previewQuery.data.preview.displayName || `@${previewQuery.data.preview.publicHandle}`}
                  </p>
                  <p className="truncate text-muted-foreground">@{previewQuery.data.preview.publicHandle}</p>
                </div>
              </div>
            ) : debouncedHandle.length >= 2 && isHandleStructurallyValid ? (
              <p className="text-amber-600">No user found for @{debouncedHandle} yet.</p>
            ) : (
              <p className="text-muted-foreground">Use a valid handle like @axfriend</p>
            )}
          </div>
        ) : null}
        {isOwner && invitePulse ? (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {invitePulse}
          </div>
        ) : null}
        {isOwner && handleError ? (
          <p className="text-sm text-destructive mt-1" role="alert">
            {handleError}
          </p>
        ) : null}

        <div className="space-y-2 mt-2">
          {collaborators.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No collaborators yet. Invite someone to start collaborating!
            </p>
          ) : (
            collaborators.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center justify-between rounded-lg bg-muted/50 p-2",
                  highlightUserId === c.userId && "axtask-collab-row-intro ring-2 ring-primary/35",
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: stringToColor(c.publicHandle) }}
                  >
                    {(c.displayName || c.publicHandle).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.displayName || `@${c.publicHandle}`}</p>
                    <p className="text-xs text-muted-foreground">@{c.publicHandle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner ? (
                    <>
                      <Select
                        value={c.role}
                        onValueChange={(newRole) => updateRoleMutation.mutate({ userId: c.userId, role: newRole })}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={() => removeMutation.mutate(c.userId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {roleIcon(c.role)}
                      <span className="capitalize">{c.role}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {isOwner && (
          <>
            <Separator className="my-4" />
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe2 className="h-4 w-4 text-sky-600" />
                Community (public listing)
              </div>
              <p className="text-xs text-muted-foreground">
                MFA is required to publish or unpublish. Anyone can read the listing from the Community page without signing in.
              </p>
              {visibility === "community" ? (
                <Badge className="bg-sky-600">Live on community</Badge>
              ) : (
                <Badge variant="outline">Private</Badge>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="comm-notes"
                  checked={showNotes}
                  onCheckedChange={(v) => setShowNotes(v === true)}
                  disabled={visibility === "community"}
                />
                <Label htmlFor="comm-notes" className="text-sm font-normal cursor-pointer">
                  Include notes in the public listing (off by default)
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibility !== "community" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={mfaSending || publishMutation.isPending}
                    onClick={() => startPublishMfa().catch((e: Error) => toast({ title: "Could not send code", description: e.message, variant: "destructive" }))}
                  >
                    Publish with MFA
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mfaSending || unpublishMutation.isPending}
                    onClick={() => startUnpublishMfa().catch((e: Error) => toast({ title: "Could not send code", description: e.message, variant: "destructive" }))}
                  >
                    Unpublish with MFA
                  </Button>
                )}
              </div>
              <MfaVerificationPanel
                open={pubMfaOpen}
                challengeId={pubChallenge?.challengeId}
                purpose={MFA_PURPOSES.COMMUNITY_PUBLISH_TASK}
                title="Verify to publish"
                description={
                  pubChallenge?.maskedDestination
                    ? `Enter the code sent to ${pubChallenge.maskedDestination}.`
                    : "Enter the code we emailed you."
                }
                expiresAt={pubChallenge?.expiresAt}
                devCode={pubChallenge?.devCode ?? null}
                isBusy={publishMutation.isPending}
                onDismiss={() => {
                  setPubMfaOpen(false);
                  setPubChallenge(null);
                }}
                onResend={() =>
                  startPublishMfa().catch((e: Error) => {
                    console.error("[share-dialog] publish MFA resend failed", e);
                    toast({ title: "Could not send code", description: e.message, variant: "destructive" });
                  })
                }
                onSubmitCode={(code) => {
                  if (!pubChallenge) return;
                  publishMutation.mutate({ challengeId: pubChallenge.challengeId, code });
                }}
              />
              <MfaVerificationPanel
                open={unpubMfaOpen}
                challengeId={unpubChallenge?.challengeId}
                purpose={MFA_PURPOSES.COMMUNITY_UNPUBLISH_TASK}
                title="Verify to unpublish"
                description={
                  unpubChallenge?.maskedDestination
                    ? `Enter the code sent to ${unpubChallenge.maskedDestination}.`
                    : "Enter the code we emailed you."
                }
                expiresAt={unpubChallenge?.expiresAt}
                devCode={unpubChallenge?.devCode ?? null}
                isBusy={unpublishMutation.isPending}
                onDismiss={() => {
                  setUnpubMfaOpen(false);
                  setUnpubChallenge(null);
                }}
                onResend={() =>
                  startUnpublishMfa().catch((e: Error) => {
                    console.error("[share-dialog] unpublish MFA resend failed", e);
                    toast({ title: "Could not send code", description: e.message, variant: "destructive" });
                  })
                }
                onSubmitCode={(code) => {
                  if (!unpubChallenge) return;
                  unpublishMutation.mutate({ challengeId: unpubChallenge.challengeId, code });
                }}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
  return colors[Math.abs(hash) % colors.length];
}
