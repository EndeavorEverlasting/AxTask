import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, Sparkles } from "lucide-react";
import type { PublicConversionArtifact } from "@shared/public-client-dtos";

export default function BundlesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/conversion-artifacts"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/conversion-artifacts");
      if (!r.ok) throw new Error("list");
      return (await r.json()) as PublicConversionArtifact[];
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <PretextPageHeader
        eyebrow="Productivity"
        title="Task bundles"
        subtitle="Conversion artifacts preserve your original prompt and group generated tasks."
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href="/bundles/new?template=pmp">
              <Sparkles className="h-4 w-4 mr-1.5" />
              PMP template
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading bundles…
        </div>
      ) : !data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No bundles yet</CardTitle>
            <CardDescription>
              Convert a multi-line task from the task form, or launch the PMP registration sprint template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/bundles/new?template=pmp">Use PMP template</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((b) => (
            <Link key={b.id} href={`/bundles/${b.id}`}>
              <Card className="h-full hover:border-primary/40 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    <Layers className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{b.title}</CardTitle>
                      <CardDescription className="text-xs capitalize">
                        {b.conversionType.replace(/_/g, " ")}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {typeof b.completedChildren === "number" && typeof b.totalChildren === "number" ? (
                    <p>
                      {b.completedChildren}/{b.totalChildren} tasks completed
                    </p>
                  ) : (
                    <p>Open for details</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
