import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Sparkles } from "lucide-react";
import { SkillTreeView, type SkillTreeKind } from "@/components/skill-tree/skill-tree-view";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { FloatingChip } from "@/components/ui/floating-chip";

const VALID_TABS = new Set<SkillTreeKind>(["avatar", "offline"]);

export default function SkillTreePage() {
  const search = useSearch();
  const [activeTab, setActiveTab] = useState<SkillTreeKind>("avatar");

  useEffect(() => {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    if (tab && VALID_TABS.has(tab as SkillTreeKind)) {
      setActiveTab(tab as SkillTreeKind);
    }
  }, [search]);

  return (
    <div id="skill-tree-root" className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <PretextPageHeader
        eyebrow="Progression"
        title={
          <span className="inline-flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" aria-hidden />
            Skill Tree
          </span>
        }
        subtitle="Spend AxCoins to unlock progression nodes. Avatar skills boost your companions and productivity exports; Offline skills grow the background coin generator. Prerequisite nodes must be purchased before their children become available."
        chips={
          <>
            <FloatingChip tone="neutral">Avatar skills</FloatingChip>
            <FloatingChip tone="success">Offline generator</FloatingChip>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SkillTreeKind)}>
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="avatar" data-testid="skill-tree-tab-avatar">
            Avatar
          </TabsTrigger>
          <TabsTrigger value="offline" data-testid="skill-tree-tab-offline">
            Offline generator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="avatar" className="mt-4">
          <Card className="glass-panel-glossy">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
                Avatar skills
              </CardTitle>
              <CardDescription>
                Unlock companion slots, deeper guidance, and export discounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SkillTreeView tree="avatar" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offline" className="mt-4">
          <Card className="glass-panel-glossy">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
                Offline generator
              </CardTitle>
              <CardDescription>
                Raise the idle AxCoin production rate and extend how long the generator stays
                productive while you're away.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SkillTreeView tree="offline" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
