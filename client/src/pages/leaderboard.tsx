import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Flame, Users2, Coins, Medal } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  equippedTitle: string | null;
  skillTier: number;
  metricValue: number;
}

interface LeaderboardResult {
  top25: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
}

function SkillTierBadge({ tier }: { tier: number }) {
  if (tier === 0) return null;
  const styles =
    tier >= 2
      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-300 dark:border-blue-700";
  return (
    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${styles}`}>
      T{tier}
    </span>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return (
    <span className="text-sm font-bold text-gray-500 dark:text-gray-400 w-7 text-center tabular-nums">
      {rank}
    </span>
  );
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.profileImageUrl) {
    return (
      <img
        src={entry.profileImageUrl}
        alt=""
        className="h-9 w-9 rounded-full object-cover shrink-0"
      />
    );
  }
  const initials = (entry.displayName || "?").charAt(0).toUpperCase();
  return (
    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
      {initials}
    </div>
  );
}

function MetricDisplay({
  value,
  category,
}: {
  value: number;
  category: string;
}) {
  if (category === "coins") {
    return (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold tabular-nums text-sm">
        <Coins className="h-3.5 w-3.5" />
        {value.toLocaleString()}
      </span>
    );
  }
  if (category === "streak") {
    return (
      <span className="flex items-center gap-1 text-orange-500 font-bold tabular-nums text-sm">
        <Flame className="h-3.5 w-3.5" />
        {value} day{value !== 1 ? "s" : ""}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold tabular-nums text-sm">
      <Users2 className="h-3.5 w-3.5" />
      {value.toLocaleString()} contrib
    </span>
  );
}

function LeaderboardRow({
  entry,
  category,
  isMe,
  isSeparated,
}: {
  entry: LeaderboardEntry;
  category: string;
  isMe: boolean;
  isSeparated?: boolean;
}) {
  return (
    <>
      {isSeparated && (
        <li className="flex items-center gap-2 py-1 px-2">
          <div className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
          <span className="text-[10px] text-gray-400 shrink-0">your position</span>
          <div className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
        </li>
      )}
      <li>
        <Link href={`/profile/${entry.userId}`}>
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
              isMe
                ? "bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/30"
                : ""
            }`}
          >
            <div className="flex items-center justify-center w-8 shrink-0">
              <RankMedal rank={entry.rank} />
            </div>

            <Avatar entry={entry} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {entry.displayName || "Anonymous"}
                </span>
                <SkillTierBadge tier={entry.skillTier} />
                {isMe && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                    You
                  </Badge>
                )}
              </div>
              {entry.equippedTitle && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight truncate">
                  {entry.equippedTitle}
                </p>
              )}
            </div>

            <MetricDisplay value={entry.metricValue} category={category} />
          </div>
        </Link>
      </li>
    </>
  );
}

function LeaderboardList({
  category,
  period,
  currentUserId,
}: {
  category: string;
  period: string;
  currentUserId: string;
}) {
  const apiCategory =
    category === "earners"
      ? "coins"
      : category === "streaks"
      ? "streak"
      : "contributions";

  const { data, isLoading } = useQuery<LeaderboardResult>({
    queryKey: ["/api/leaderboard", apiCategory, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/leaderboard?category=${apiCategory}&period=${period}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { top25, myEntry } = data;
  const myInTop25 = myEntry ? top25.some((e) => e.userId === currentUserId) : false;

  return (
    <ul className="mt-3 space-y-0.5">
      {top25.map((entry) => (
        <LeaderboardRow
          key={entry.userId}
          entry={entry}
          category={apiCategory}
          isMe={entry.userId === currentUserId}
        />
      ))}
      {myEntry && !myInTop25 && (
        <LeaderboardRow
          entry={myEntry}
          category={apiCategory}
          isMe
          isSeparated
        />
      )}
      {top25.length === 0 && (
        <li className="text-center text-sm text-gray-500 dark:text-gray-400 py-12">
          No data yet — be the first on the leaderboard!
        </li>
      )}
    </ul>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState("earners");
  const [period, setPeriod] = useState<"all" | "week">("all");

  const showPeriod = category !== "streaks";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-amber-500 shrink-0" />
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Leaderboard
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Top community members ranked by their contributions
          </p>
        </div>
      </div>

      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="w-full">
          <TabsTrigger value="earners" className="flex-1 gap-1.5">
            <Coins className="h-4 w-4" />
            <span className="hidden sm:inline">Top</span> Earners
          </TabsTrigger>
          <TabsTrigger value="streaks" className="flex-1 gap-1.5">
            <Flame className="h-4 w-4" />
            <span className="hidden sm:inline">Top</span> Streaks
          </TabsTrigger>
          <TabsTrigger value="contributors" className="flex-1 gap-1.5">
            <Users2 className="h-4 w-4" />
            <span className="hidden sm:inline">Top</span> Contributors
          </TabsTrigger>
        </TabsList>

        {showPeriod && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setPeriod("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                period === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setPeriod("week")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                period === "week"
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              This Week
            </button>
          </div>
        )}

        <TabsContent value="earners" className="mt-0">
          {user && (
            <LeaderboardList
              category="earners"
              period={period}
              currentUserId={user.id}
            />
          )}
        </TabsContent>

        <TabsContent value="streaks" className="mt-0">
          {user && (
            <LeaderboardList
              category="streaks"
              period="all"
              currentUserId={user.id}
            />
          )}
        </TabsContent>

        <TabsContent value="contributors" className="mt-0">
          {user && (
            <LeaderboardList
              category="contributors"
              period={period}
              currentUserId={user.id}
            />
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center pb-2">
        <Medal className="h-3 w-3 inline mr-0.5" />
        Top 25 shown · Click any row to visit their profile
      </p>
    </div>
  );
}
