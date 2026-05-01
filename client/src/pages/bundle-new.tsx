import { useState } from "react";
import { useSearch, Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { materializeTemplate } from "@shared/conversion-templates";
import { pmpRegistrationSprintTemplate } from "@shared/templates/pmp-registration-sprint";

export default function BundleNewPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const templateId = params.get("template") || "";
  const [examDate, setExamDate] = useState("2026-06-25");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (templateId !== "pmp") throw new Error("Unknown template");
      const body = materializeTemplate(pmpRegistrationSprintTemplate, {
        startDate,
        examDate,
      });
      const res = await apiFetch("POST", "/api/conversion-artifacts", {
        conversionType: body.conversionType,
        title: body.title,
        originalActivity: body.originalActivity,
        originalNotes: body.originalNotes,
        items: body.items,
        taskDefaults: { date: startDate },
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { artifact: { id: string } };
    },
    onSuccess: (d) => {
      toast({ title: "Bundle created" });
      setLocation(`/bundles/${d.artifact.id}`);
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not create bundle",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    },
  });

  if (templateId !== "pmp") {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <PretextPageHeader eyebrow="Bundles" title="New bundle" subtitle="Pick a template." />
        <Button asChild variant="outline">
          <Link href="/bundles">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-6">
      <PretextPageHeader
        eyebrow="Template"
        title="PMP registration sprint"
        subtitle="17-task bundle with dependencies and Gantt-friendly dates. Exam date is capped before 2026-07-09."
      />
      <Card>
        <CardHeader>
          <CardTitle>Dates</CardTitle>
          <CardDescription>Start offsets count from the sprint start; the exam task pins to your exam date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start">Sprint start</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam">Target exam date</Label>
            <Input id="exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            Create bundle
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
