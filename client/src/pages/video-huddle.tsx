import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";

const VIDEO_BASE = import.meta.env.VITE_VIDEO_ROOM_BASE_URL as string | undefined;

export default function VideoHuddlePage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <PretextPageHeader
        eyebrow="Live"
        title="Video huddle"
        subtitle={
          <>
            Escalate from async collab to a short live session. The host environment can supply{" "}
            <code className="text-xs rounded bg-muted px-1 py-0.5">VITE_VIDEO_ROOM_BASE_URL</code> to embed a provider.
          </>
        }
      />

      <Card className="glass-panel-glossy">
        <CardHeader>
          <CardTitle>Launch</CardTitle>
          <CardDescription>
            When unset, use your team&apos;s preferred video tool alongside the task list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {VIDEO_BASE ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Audio and video from this embed are handled entirely by the meeting URL you configured (
              <code className="text-xs rounded bg-muted px-1 py-0.5">VITE_VIDEO_ROOM_BASE_URL</code>
              ). Encryption, recording policy, and data processing follow that provider&apos;s product — not AxTask
              application code. Choose a provider and plan that match your compliance needs.
            </p>
          ) : null}
          {VIDEO_BASE ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black/40">
              <iframe title="Video huddle" src={VIDEO_BASE} className="h-full w-full" allow="camera; microphone; display-capture" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No embed URL configured. Coordinate via your usual meeting link and keep execution in AxTask.
            </p>
          )}
          <Button variant="outline" asChild>
            <Link href="/collab">Back to collab inbox</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
