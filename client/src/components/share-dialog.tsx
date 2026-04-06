import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncRawTaskRequest } from "@/lib/task-sync-api";
import { useToast } from "@/hooks/use-toast";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { useMfaChallenge } from "@/hooks/use-mfa-challenge";
import { MfaVerificationPanel } from "@/components/mfa/mfa-verification-panel";
import { apiRequest } from "@/lib/queryClient";
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
import { Users, UserPlus, Trash2, Crown, Eye, Pencil, Globe2 } from "lucide-react";

interface Collaborator {
  id: string;
  taskId: string;
  userId: string;
  role: string;
  email: string;
  displayName: string | null;
  invitedAt: string;
}

interface ShareDialogProps {
  taskId: string;
  isOwner: boolean;
  visibility?: string;
  communityShowNotes?: boolean;
}

export function ShareDialog({ taskId, isOwner, visibility = "private", communityShowNotes = false }: ShareDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { requestChallenge, isRequesting: mfaSending } = useMfaChallenge();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [open, setOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(communityShowNotes);
  const [pubMfaOpen, setPubMfaOpen] = useState(false);
  const [unpubMfaOpen, setUnpubMfaOpen] = useState(false);
  const [pubChallenge, setPubChallenge] = useState<{
    challengeId: string;
    expiresAt: string;
    devCode?: string;
    maskedDestination?: string;
  } | null>(null);
  const [unpubChallenge, setUnpubChallenge] = useState<typeof pubChallenge | null>(null);

  const { data: collaborators = [] } = useQuery<Collaborator[]>({
    queryKey: ["/api/tasks", taskId, "collaborators"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/collaborators`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return syncRawTaskRequest(
        "POST",
        `/api/tasks/${taskId}/collaborators`,
        { email, role },
        queryClient,
      );
    },
    onSuccess: (data, { email }) => {
      if (data && typeof data === "object" && "offlineQueued" in data) {
        toast({ title: "Queued", description: "Invite will sync when you're online." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      setEmail("");
      toast({ title: "Collaborator added", description: `${email} has been invited.` });
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

  const publishMutation = useMutation({
    mutationFn: async ({ challengeId, code }: { challengeId: string; code: string }) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/community/publish`, {
        challengeId,
        code,
        communityShowNotes: showNotes,
      });
      return res.json();
    },
    onSuccess: () => {
      setPubMfaOpen(false);
      setPubChallenge(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Published", description: "This task is listed in Community (public)." });
    },
    onError: (err: Error) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const unpublishMutation = useMutation({
    mutationFn: async ({ challengeId, code }: { challengeId: string; code: string }) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/community/unpublish`, { challengeId, code });
      return res.json();
    },
    onSuccess: () => {
      setUnpubMfaOpen(false);
      setUnpubChallenge(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Removed from community", description: "This task is private again." });
    },
    onError: (err: Error) => toast({ title: "Unpublish failed", description: err.message, variant: "destructive" }),
  });

  const startPublishMfa = async () => {
    const c = await requestChallenge({ purpose: MFA_PURPOSES.COMMUNITY_PUBLISH_TASK, channel: "email" });
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
    const c = await requestChallenge({ purpose: MFA_PURPOSES.COMMUNITY_UNPUBLISH_TASK, channel: "email" });
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
          <div className="flex gap-2">
            <Input
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email) addMutation.mutate({ email, role });
              }}
              className="flex-1"
            />
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
              onClick={() => email && addMutation.mutate({ email, role })}
              disabled={!email || addMutation.isPending}
              size="icon"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="space-y-2 mt-2">
          {collaborators.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No collaborators yet. Invite someone to start collaborating!
            </p>
          ) : (
            collaborators.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: stringToColor(c.email) }}
                  >
                    {(c.displayName || c.email).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.displayName || c.email}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
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
                onResend={() => void startPublishMfa()}
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
                onResend={() => void startUnpublishMfa()}
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
