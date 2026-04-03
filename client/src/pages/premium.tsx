import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crown, Sparkles, RefreshCw, Radar, Route, ShieldAlert } from "lucide-react";

type PremiumCatalog = {
  plans: Array<{
    product: string;
    planKey: string;
    monthlyPriceUsd: number;
    features: string[];
    discountPercentVsSeparate?: number;
  }>;
};

type EntitlementsPayload = {
  entitlements: {
    userId: string;
    planKeys: string[];
    products: string[];
    inGracePeriod: boolean;
    graceUntil: string | null;
    features: string[];
  };
  subscriptions: Array<{
    id: string;
    product: string;
    planKey: string;
    status: string;
    graceUntil: string | null;
  }>;
};

type SavedView = {
  id: string;
  name: string;
  autoRefreshMinutes: number;
  filtersJson: string;
  isDefault: boolean;
};

type ReviewWorkflow = {
  id: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  criteriaJson: string;
  templateJson: string;
  isActive: boolean;
  lastRunAt: string | null;
};

type PremiumInsight = {
  id: string;
  source: string;
  insightType: string;
  title: string;
  body: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved";
};

type ReactivationPayload = {
  inGracePeriod: boolean;
  graceUntil: string | null;
  prompts: string[];
};

export default function PremiumPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [savedViewName, setSavedViewName] = useState("My Smart View");
  const [savedViewFilters, setSavedViewFilters] = useState(JSON.stringify({ status: "pending", priority: ["High", "Highest"] }));
  const [savedViewRefresh, setSavedViewRefresh] = useState(15);

  const [workflowName, setWorkflowName] = useState("Weekly Triage");
  const [workflowCadence, setWorkflowCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [workflowCriteria, setWorkflowCriteria] = useState(JSON.stringify({ includeOverdue: true, includeHighPriority: true }));
  const [workflowTemplate, setWorkflowTemplate] = useState(JSON.stringify({ sections: ["Overdue", "High Priority", "Stalled"] }));

  const { data: catalog } = useQuery<PremiumCatalog>({ queryKey: ["/api/premium/catalog"] });
  const { data: entitlementsData } = useQuery<EntitlementsPayload>({ queryKey: ["/api/premium/entitlements"] });
  const { data: savedViews = [] } = useQuery<SavedView[]>({ queryKey: ["/api/premium/saved-views"] });
  const { data: workflows = [] } = useQuery<ReviewWorkflow[]>({ queryKey: ["/api/premium/review-workflows"] });
  const { data: insights = [] } = useQuery<PremiumInsight[]>({ queryKey: ["/api/premium/insights"] });
  const { data: reactivation } = useQuery<ReactivationPayload>({ queryKey: ["/api/premium/reactivation-prompts"] });

  const entitlements = entitlementsData?.entitlements;

  const premiumPlans = useMemo(() => catalog?.plans || [], [catalog]);

  const refreshPremiumQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/premium/entitlements"] });
    queryClient.invalidateQueries({ queryKey: ["/api/premium/saved-views"] });
    queryClient.invalidateQueries({ queryKey: ["/api/premium/review-workflows"] });
    queryClient.invalidateQueries({ queryKey: ["/api/premium/insights"] });
    queryClient.invalidateQueries({ queryKey: ["/api/premium/reactivation-prompts"] });
  };

  const activatePlanMutation = useMutation({
    mutationFn: async ({ product, planKey }: { product: "axtask" | "nodeweaver" | "bundle"; planKey: string }) => {
      const res = await apiRequest("POST", "/api/premium/subscriptions/activate", { product, planKey });
      return res.json();
    },
    onSuccess: () => {
      refreshPremiumQueries();
      toast({ title: "Premium activated", description: "Subscription was activated successfully." });
    },
    onError: (err: Error) => toast({ title: "Activation failed", description: err.message, variant: "destructive" }),
  });

  const downgradeMutation = useMutation({
    mutationFn: async (product: "axtask" | "nodeweaver" | "bundle") => {
      const res = await apiRequest("POST", "/api/premium/subscriptions/downgrade", { product, graceDays: 14 });
      return res.json();
    },
    onSuccess: () => {
      refreshPremiumQueries();
      toast({ title: "Grace mode started", description: "Premium moved to grace mode for 14 days." });
    },
    onError: (err: Error) => toast({ title: "Downgrade failed", description: err.message, variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (product: "axtask" | "nodeweaver" | "bundle") => {
      const res = await apiRequest("POST", "/api/premium/subscriptions/reactivate", { product });
      return res.json();
    },
    onSuccess: () => {
      refreshPremiumQueries();
      toast({ title: "Premium reactivated", description: "Full premium write access restored." });
    },
    onError: (err: Error) => toast({ title: "Reactivation failed", description: err.message, variant: "destructive" }),
  });

  const createSavedViewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/saved-views", {
        name: savedViewName,
        filtersJson: savedViewFilters,
        autoRefreshMinutes: savedViewRefresh,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/saved-views"] });
      toast({ title: "Saved view created" });
    },
    onError: (err: Error) => toast({ title: "Could not create saved view", description: err.message, variant: "destructive" }),
  });

  const setDefaultSavedViewMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/premium/saved-views/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/saved-views"] });
      toast({ title: "Default view updated" });
    },
    onError: (err: Error) => toast({ title: "Could not set default", description: err.message, variant: "destructive" }),
  });

  const deleteSavedViewMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/premium/saved-views/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/saved-views"] });
      toast({ title: "Saved view removed" });
    },
    onError: (err: Error) => toast({ title: "Could not delete saved view", description: err.message, variant: "destructive" }),
  });

  const createWorkflowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/review-workflows", {
        name: workflowName,
        cadence: workflowCadence,
        criteriaJson: workflowCriteria,
        templateJson: workflowTemplate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/review-workflows"] });
      toast({ title: "Review workflow created" });
    },
    onError: (err: Error) => toast({ title: "Could not create workflow", description: err.message, variant: "destructive" }),
  });

  const runWorkflowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/premium/review-workflows/${id}/run`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/review-workflows"] });
      toast({ title: "Workflow run complete", description: "Review summary generated." });
    },
    onError: (err: Error) => toast({ title: "Workflow run failed", description: err.message, variant: "destructive" }),
  });

  const createDigestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/digests/weekly");
      return res.json();
    },
    onSuccess: () => toast({ title: "Weekly digest generated", description: "Digest run completed successfully." }),
    onError: (err: Error) => toast({ title: "Digest failed", description: err.message, variant: "destructive" }),
  });

  const reclassifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/bundle/reclassify-backlog");
      return res.json();
    },
    onSuccess: (payload: { scanned?: number; updated?: number }) => {
      toast({
        title: "Backlog reclassified",
        description: `Scanned ${payload.scanned || 0} tasks, updated ${payload.updated || 0}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/premium/insights"] });
    },
    onError: (err: Error) => toast({ title: "Reclassification failed", description: err.message, variant: "destructive" }),
  });

  const reprioritizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/bundle/auto-reprioritize", { lowConfidenceThreshold: 0.45 });
      return res.json();
    },
    onSuccess: (payload: { scanned?: number; reprioritized?: number }) => {
      toast({
        title: "Auto-reprioritize finished",
        description: `Scanned ${payload.scanned || 0}, reprioritized ${payload.reprioritized || 0}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (err: Error) => toast({ title: "Auto-reprioritize failed", description: err.message, variant: "destructive" }),
  });

  const resolveInsightMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/premium/insights/${id}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/premium/insights"] });
      toast({ title: "Insight resolved" });
    },
    onError: (err: Error) => toast({ title: "Could not resolve insight", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Crown className="h-7 w-7 text-amber-500" />
            Premium Control Center
          </h2>
          <p className="text-gray-600 dark:text-gray-400">Manage premium features, retention workflows, and bundle automation.</p>
        </div>
        <Button variant="outline" onClick={refreshPremiumQueries}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Entitlements</CardTitle>
          <CardDescription>Feature access across AxTask Pro, NodeWeaver Pro, and Power Bundle.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(entitlements?.planKeys || []).map((plan) => (
              <Badge key={plan}>{plan}</Badge>
            ))}
            {(!entitlements || entitlements.planKeys.length === 0) && <Badge variant="outline">No active premium plans</Badge>}
          </div>
          {entitlements?.inGracePeriod && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Grace mode active until {entitlements.graceUntil ? new Date(entitlements.graceUntil).toLocaleString() : "unknown"}.
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="savedViews">Saved Views</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="bundle">Bundle</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {premiumPlans.map((plan) => (
              <Card key={plan.planKey}>
                <CardHeader>
                  <CardTitle className="text-base">{plan.planKey}</CardTitle>
                  <CardDescription>{plan.product} • ${plan.monthlyPriceUsd}/mo</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {plan.features.slice(0, 4).map((feature) => (
                      <Badge key={feature} variant="secondary">{feature}</Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => activatePlanMutation.mutate({ product: plan.product as "axtask" | "nodeweaver" | "bundle", planKey: plan.planKey })}
                      disabled={activatePlanMutation.isPending}
                    >
                      Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downgradeMutation.mutate(plan.product as "axtask" | "nodeweaver" | "bundle")}
                      disabled={downgradeMutation.isPending}
                    >
                      Grace
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reactivateMutation.mutate(plan.product as "axtask" | "nodeweaver" | "bundle")}
                      disabled={reactivateMutation.isPending}
                    >
                      Reactivate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button onClick={() => createDigestMutation.mutate()} disabled={createDigestMutation.isPending}>
            <Sparkles className="h-4 w-4 mr-2" />
            Run Weekly Digest
          </Button>
        </TabsContent>

        <TabsContent value="savedViews" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Saved Smart View</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={savedViewName} onChange={(e) => setSavedViewName(e.target.value)} placeholder="View name" />
              <Input
                type="number"
                min={1}
                max={1440}
                value={savedViewRefresh}
                onChange={(e) => setSavedViewRefresh(Number(e.target.value) || 15)}
                placeholder="Auto refresh minutes"
              />
              <Textarea value={savedViewFilters} onChange={(e) => setSavedViewFilters(e.target.value)} className="min-h-[100px]" />
              <Button onClick={() => createSavedViewMutation.mutate()} disabled={createSavedViewMutation.isPending}>
                Create Saved View
              </Button>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedViews.map((view) => (
              <Card key={view.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {view.name}
                    {view.isDefault && <Badge>Default</Badge>}
                  </CardTitle>
                  <CardDescription>Auto refresh every {view.autoRefreshMinutes} min</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <pre className="text-xs rounded bg-gray-100 dark:bg-gray-800 p-2 overflow-auto">{view.filtersJson}</pre>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDefaultSavedViewMutation.mutate(view.id)}>Set Default</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteSavedViewMutation.mutate(view.id)}>Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Review Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} placeholder="Workflow name" />
              <Input value={workflowCadence} onChange={(e) => setWorkflowCadence((e.target.value as "daily" | "weekly" | "monthly") || "weekly")} placeholder="daily | weekly | monthly" />
              <Textarea value={workflowCriteria} onChange={(e) => setWorkflowCriteria(e.target.value)} className="min-h-[80px]" />
              <Textarea value={workflowTemplate} onChange={(e) => setWorkflowTemplate(e.target.value)} className="min-h-[80px]" />
              <Button onClick={() => createWorkflowMutation.mutate()} disabled={createWorkflowMutation.isPending}>
                Create Workflow
              </Button>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id}>
                <CardHeader>
                  <CardTitle className="text-base">{workflow.name}</CardTitle>
                  <CardDescription>{workflow.cadence} • {workflow.isActive ? "active" : "inactive"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="sm" onClick={() => runWorkflowMutation.mutate(workflow.id)} disabled={runWorkflowMutation.isPending}>
                    Run Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bundle" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cross-Product Automation</CardTitle>
              <CardDescription>Bundle-only reclassification and auto-reprioritization hooks.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={() => reclassifyMutation.mutate()} disabled={reclassifyMutation.isPending}>
                <Radar className="h-4 w-4 mr-2" />
                Reclassify Backlog
              </Button>
              <Button variant="outline" onClick={() => reprioritizeMutation.mutate()} disabled={reprioritizeMutation.isPending}>
                <Route className="h-4 w-4 mr-2" />
                Auto-Reprioritize
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4 space-y-4">
          {reactivation?.inGracePeriod && (
            <Card className="border-amber-300 dark:border-amber-700">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Reactivation Prompts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {reactivation.prompts.map((prompt, idx) => (
                  <p key={`${prompt}-${idx}`} className="text-sm">{prompt}</p>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight) => (
              <Card key={insight.id}>
                <CardHeader>
                  <CardTitle className="text-base">{insight.title}</CardTitle>
                  <CardDescription>{insight.source} • {insight.insightType}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{insight.body}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{insight.severity}</Badge>
                    <Badge>{insight.status}</Badge>
                  </div>
                  {insight.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => resolveInsightMutation.mutate(insight.id)}>
                      Resolve
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
