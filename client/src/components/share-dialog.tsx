import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Trash2, Crown, Eye, Pencil, Coins, Gift } from "lucide-react";

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
}

export function ShareDialog({ taskId, isOwner }: ShareDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [open, setOpen] = useState(false);
  const [giftUserId, setGiftUserId] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState("");

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
      const res = await apiRequest("POST", `/api/tasks/${taskId}/collaborators`, { email, role });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      const savedEmail = email;
      setEmail("");
      if (result.collabReward && result.collabReward.coinsEarned > 0) {
        const badges = result.collabReward.badgesEarned || [];
        const badgeText = badges.length > 0 ? ` New badge${badges.length > 1 ? "s" : ""} earned!` : "";
        toast({
          title: `Collaborator added! +${result.collabReward.coinsEarned} coins`,
          description: `${savedEmail} has been invited.${badgeText} Balance: ${result.collabReward.newBalance}`,
        });
      } else {
        toast({ title: "Collaborator added", description: `${savedEmail} has been invited.` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/tasks/${taskId}/collaborators/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
      toast({ title: "Collaborator removed" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PUT", `/api/tasks/${taskId}/collaborators/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "collaborators"] });
    },
  });

  const giftMutation = useMutation({
    mutationFn: async ({ toUserId, amount }: { toUserId: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/gamification/gift", { toUserId, amount });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
      toast({ title: "Coins gifted!", description: `Your new balance: ${data.senderBalance}` });
      setGiftUserId(null);
      setGiftAmount("");
    },
    onError: (err: Error) => {
      toast({ title: "Gift failed", description: err.message, variant: "destructive" });
    },
  });

  const roleIcon = (r: string) => {
    if (r === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (r === "editor") return <Pencil className="h-3.5 w-3.5 text-blue-500" />;
    return <Eye className="h-3.5 w-3.5 text-gray-500" />;
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
                  {giftUserId === c.userId ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="1"
                        max="500"
                        placeholder="Coins"
                        value={giftAmount}
                        onChange={(e) => setGiftAmount(e.target.value)}
                        className="w-20 h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!giftAmount || parseInt(giftAmount) < 1 || giftMutation.isPending}
                        onClick={() => giftMutation.mutate({ toUserId: c.userId, amount: parseInt(giftAmount) })}
                      >
                        Send
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setGiftUserId(null); setGiftAmount(""); }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-amber-500 hover:text-amber-700"
                        onClick={() => setGiftUserId(c.userId)}
                        title="Gift coins"
                      >
                        <Gift className="h-3.5 w-3.5" />
                      </Button>
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
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
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
