import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const VIDEO_BASE = import.meta.env.VITE_VIDEO_ROOM_BASE_URL as string | undefined;

export default function VideoHuddlePage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Video huddle</h1>
      <p className="text-muted-foreground text-sm">
        Escalate from async collab to a short live session. The host environment can supply{" "}
        <code className="text-xs rounded bg-muted px-1 py-0.5">VITE_VIDEO_ROOM_BASE_URL</code> to embed a provider.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Launch</CardTitle>
          <CardDescription>
            When unset, use your team&apos;s preferred video tool alongside the task list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
