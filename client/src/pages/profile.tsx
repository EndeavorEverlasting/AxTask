import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserRoundCog, ShoppingBag, Globe2, Cake } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function initials(displayName: string | null | undefined, email: string | null | undefined): string {
  const base = (displayName || email || "").trim();
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] || "")
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: ownerProfile } = useQuery({
    queryKey: ["/api/account/profile"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/account/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json() as Promise<{ displayName: string | null; birthDate: string | null }>;
    },
    enabled: Boolean(user),
  });

  const label = (user?.displayName || "").trim() || user?.email || "You";
  const ini = initials(user?.displayName, user?.email);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <PretextPageHeader
        eyebrow="You"
        title="My profile"
        subtitle="How you show up in AxTask, and where to tune each layer."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/messages">E2EE messages</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account">
                <UserRoundCog className="h-4 w-4 mr-2" />
                Account &amp; security
              </Link>
            </Button>
          </>
        }
      />

      <Card className="glass-panel-glossy">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Your primary identity in the app (same session as the sidebar).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4">
          {user?.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="h-20 w-20 rounded-full object-cover border border-border shrink-0"
            />
          ) : (
            <div
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary text-xl font-semibold shrink-0 border border-border",
              )}
            >
              {ini || "?"}
            </div>
          )}
          <div className="space-y-1 min-w-0">
            <p className="text-lg font-semibold truncate">{label}</p>
            {user?.email ? (
              <p className="text-sm text-muted-foreground break-all">{user.email}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Display name (editable):{" "}
              <span className="text-foreground font-medium">
                {(ownerProfile?.displayName ?? user?.displayName)?.trim() || "—"}
              </span>
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Cake className="h-3.5 w-3.5 shrink-0" />
              Birthday on file:{" "}
              <span className="text-foreground font-medium">
                {ownerProfile?.birthDate?.trim() ? ownerProfile.birthDate : "—"}
              </span>
              <span className="text-xs">
                (optional; milestones + minimum age 13+ for community, collab, feedback, and DMs)
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" />
            Community appearance
          </CardTitle>
          <CardDescription>
            Forum threads use your{" "}
            <span className="text-foreground font-medium">orb archetype</span> (name and colors), not necessarily the
            display name above. That keeps the board playful and consistent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/community">Open Community</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Rewards &amp; companions
          </CardTitle>
          <CardDescription>Avatars, badges, coins, and titles live on the Rewards profile tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/rewards?tab=profile">Open Rewards — Profile</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
