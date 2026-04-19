import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicDbStorageTopUsersResponse } from "@shared/public-client-dtos";
import { humanBytes } from "./format-bytes";

interface TopUsersByStorageProps {
  kind: "attachments" | "tasks";
  limit?: number;
}

/**
 * Top-N users by either attachment bytes or task text bytes. User
 * identifiers are hashed server-side (never the raw userId — see
 * docs/CLIENT_VISIBLE_PRIVACY.md). Operators can de-hash via logs if
 * they genuinely need to identify someone who's dominating storage.
 */
export function TopUsersByStorage({ kind, limit = 20 }: TopUsersByStorageProps) {
  const { data, isLoading, isError } = useQuery<PublicDbStorageTopUsersResponse>({
    queryKey: [`/api/admin/db-storage/top-users?kind=${kind}&limit=${limit}`],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const rows = data?.rows ?? [];
  const label = kind === "attachments" ? "Top users by attachment bytes" : "Top users by task text bytes";
  const description =
    kind === "attachments"
      ? "Sum of attachment_assets.byte_size per user. Drives attachment-retention-run planning."
      : "octet_length of task notes + activity + prerequisites + classification_associations per user.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" aria-hidden />
          {label}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent data-testid={`top-users-${kind}`}>
        {isError ? (
          <p className="text-sm text-destructive">Failed to load top users.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">User (hashed)</th>
                <th className="py-2 px-2 text-right">Bytes</th>
                <th className="py-2 px-2 text-right">Rows</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userKey} className="border-b border-border/60" data-testid={`top-users-${kind}-row-${i}`}>
                  <td className="py-2 px-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-2 font-mono text-xs" data-testid={`top-users-${kind}-key-${i}`}>{r.userKey}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{humanBytes(r.bytes)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.rowCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default TopUsersByStorage;
