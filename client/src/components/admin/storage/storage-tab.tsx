import { DbSizeCard } from "@/components/admin/db-size-card";
import { DbSizeTrendCard } from "./db-size-trend-card";
import { PerDomainRollup } from "./per-domain-rollup";
import { PerTableBreakdown } from "./per-table-breakdown";
import { TopUsersByStorage } from "./top-users-by-storage";
import { RetentionPruneActions } from "./retention-prune-actions";

/**
 * Admin > Storage tab. Parent for the granular per-table / per-domain /
 * per-user storage readouts plus the dry-run + run-now retention
 * controls.
 *
 * Mounted from client/src/pages/admin.tsx inside <TabsContent
 * value="storage">. All child cards are self-fetching so this stays a
 * thin layout shell — makes the tab's tests trivially composable
 * through MSW fixtures at the /api/admin/db-storage/* level.
 */
export function StorageTab() {
  return (
    <div className="space-y-4" data-testid="admin-storage-tab">
      <DbSizeCard />
      <DbSizeTrendCard />
      <PerDomainRollup />
      <PerTableBreakdown />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopUsersByStorage kind="attachments" />
        <TopUsersByStorage kind="tasks" />
      </div>
      <RetentionPruneActions />
    </div>
  );
}

export default StorageTab;
