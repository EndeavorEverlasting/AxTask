import { UnifiedSkillTreeView } from "@/components/skill-tree/skill-tree-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Sparkles } from "lucide-react";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { FloatingChip } from "@/components/ui/floating-chip";

export default function SkillTreePage() {
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
        subtitle="Spend AxCoins to unlock progression nodes. Companion and productivity skills sit on the left; idle generator skills sit on the right. Prerequisite nodes must be purchased before their children become available."
        chips={
          <>
            <FloatingChip tone="neutral">Companions &amp; productivity</FloatingChip>
            <FloatingChip tone="success">Idle generator</FloatingChip>
          </>
        }
      />

      <Card className="glass-panel-glossy axtask-pretext-hud">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
            Progression tree
          </CardTitle>
          <CardDescription>
            One canvas for avatar-linked skills and background idle upgrades. Pan and zoom the graph;
            use the minimap on large screens to navigate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnifiedSkillTreeView />
        </CardContent>
      </Card>
    </div>
  );
}
