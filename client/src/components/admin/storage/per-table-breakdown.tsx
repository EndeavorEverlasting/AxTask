import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table as TableIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  PublicDbStorageTablesResponse,
  PublicStorageDomain,
} from "@shared/public-client-dtos";
import { humanBytes } from "./format-bytes";

/**
 * Sortable per-table list. Filter pills let an operator narrow to a
 * single domain (e.g. "which tasks tables are biggest?"). Default sort
 * is total bytes desc, matching pg_stat_user_tables semantics.
 */
type SortKey = "totalBytes" | "tableBytes" | "indexBytes" | "liveRows" | "deadRows" | "tableName";

const DOMAIN_FILTERS: Array<{ id: "all" | PublicStorageDomain; label: string }> = [
  { id: "all", label: "All" },
  { id: "core", label: "Core" },
  { id: "tasks", label: "Tasks" },
  { id: "gamification", label: "Gamification" },
  { id: "ops", label: "Ops" },
  { id: "unknown", label: "Unknown" },
];

export function PerTableBreakdown() {
  const { data, isLoading, isError } = useQuery<PublicDbStorageTablesResponse>({
    queryKey: ["/api/admin/db-storage/tables"],
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const [filter, setFilter] = useState<"all" | PublicStorageDomain>("all");
  const [sortKey, setSortKey] = useState<SortKey>("totalBytes");
  const [ascending, setAscending] = useState(false);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const filtered = filter === "all" ? list : list.filter((r) => r.domain === filter);
    const sorted = [...filtered].sort((a, b) => {
      const aVal = sortKey === "tableName" ? a.tableName : a[sortKey];
      const bVal = sortKey === "tableName" ? b.tableName : b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return ascending ? aVal - bVal : bVal - aVal;
      }
      return ascending
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return sorted;
  }, [data, filter, sortKey, ascending]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setAscending((a) => !a);
    } else {
      setSortKey(key);
      setAscending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-primary" aria-hidden />
          Per-table breakdown
        </CardTitle>
        <CardDescription>
          Postgres <code className="text-xs">pg_total_relation_size</code> per table. Heap is row data + TOAST,
          indexes is every btree/hash reachable from the table. Dead rows → vacuum pressure.
        </CardDescription>
      </CardHeader>
      <CardContent data-testid="per-table-breakdown">
        <div className="flex flex-wrap gap-2 pb-3">
          {DOMAIN_FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
              data-testid={`per-table-filter-${f.id}`}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {isError ? (
          <p className="text-sm text-destructive">Failed to load per-table storage.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tables in this domain.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="per-table-table">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <Th label="Table" sortKey="tableName" current={sortKey} ascending={ascending} onClick={toggleSort} />
                  <th className="py-2 px-2">Domain</th>
                  <Th label="Total" sortKey="totalBytes" current={sortKey} ascending={ascending} onClick={toggleSort} align="right" />
                  <Th label="Heap" sortKey="tableBytes" current={sortKey} ascending={ascending} onClick={toggleSort} align="right" />
                  <Th label="Indexes" sortKey="indexBytes" current={sortKey} ascending={ascending} onClick={toggleSort} align="right" />
                  <Th label="Live rows" sortKey="liveRows" current={sortKey} ascending={ascending} onClick={toggleSort} align="right" />
                  <Th label="Dead" sortKey="deadRows" current={sortKey} ascending={ascending} onClick={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tableName} className="border-b border-border/60" data-testid={`per-table-row-${r.tableName}`}>
                    <td className="py-2 px-2 font-mono text-xs">{r.tableName}</td>
                    <td className="py-2 px-2 capitalize text-xs">{r.domain}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{humanBytes(r.totalBytes)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{humanBytes(r.tableBytes)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{humanBytes(r.indexBytes)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.liveRows.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.deadRows.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ThProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  ascending: boolean;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}
function Th({ label, sortKey, current, ascending, onClick, align = "left" }: ThProps) {
  const isActive = current === sortKey;
  return (
    <th
      className={`py-2 px-2 ${align === "right" ? "text-right" : "text-left"} cursor-pointer select-none`}
      onClick={() => onClick(sortKey)}
      data-testid={`per-table-sort-${sortKey}`}
    >
      <span className={isActive ? "font-semibold text-foreground" : ""}>
        {label}
        {isActive ? (ascending ? " ↑" : " ↓") : ""}
      </span>
    </th>
  );
}

export default PerTableBreakdown;
