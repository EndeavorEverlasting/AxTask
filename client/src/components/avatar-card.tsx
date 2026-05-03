import { useQuery } from "@tanstack/react-query";
import { Users, Award, Coins } from "lucide-react";

export interface AvatarCardData {
  displayName: string | null;
  profileImageUrl: string | null;
  equippedTitle: string | null;
  skillTier: 0 | 1 | 2;
  badgeCount: number;
  coinBalance: number;
}

function SkillTierBadge({ tier }: { tier: 0 | 1 | 2 }) {
  if (tier === 0) return null;
  const styles =
    tier === 2
      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-300 dark:border-blue-700";
  return (
    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${styles}`}>
      T{tier}
    </span>
  );
}

interface AvatarCardProps {
  userId: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  size?: "sm" | "md";
}

export function AvatarCard({
  userId,
  displayName: fallbackName,
  profileImageUrl: fallbackImg,
  size = "sm",
}: AvatarCardProps) {
  const { data } = useQuery<AvatarCardData>({
    queryKey: ["/api/users", userId, "avatar-card"],
    staleTime: 60_000,
  });

  const name = data?.displayName ?? fallbackName ?? "Anonymous";
  const img = data?.profileImageUrl ?? fallbackImg ?? null;
  const title = data?.equippedTitle ?? null;
  const tier = data?.skillTier ?? 0;
  const badgeCount = data?.badgeCount ?? 0;
  const coinBalance = data?.coinBalance ?? null;

  const imgSize = size === "md" ? "h-8 w-8" : "h-4 w-4";
  const iconSize = size === "md" ? "h-8 w-8" : "h-3.5 w-3.5";
  const innerIconSize = size === "md" ? "h-4 w-4" : "h-3 w-3";

  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {img ? (
        <img src={img} alt="" className={`${imgSize} rounded-full shrink-0 object-cover`} />
      ) : (
        <span className={`${iconSize} rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0`}>
          <Users className={`${innerIconSize} text-gray-500 dark:text-gray-400`} />
        </span>
      )}
      <span className="flex flex-col min-w-0">
        <span className="flex items-center gap-1 flex-wrap">
          <span className={`${size === "md" ? "text-sm font-semibold" : "text-xs font-medium"} text-gray-900 dark:text-gray-100 truncate`}>
            {name}
          </span>
          <SkillTierBadge tier={tier} />
          {size === "md" && badgeCount > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
              <Award className="h-2.5 w-2.5" />
              {badgeCount}
            </span>
          )}
          {size === "md" && coinBalance !== null && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold text-yellow-600 dark:text-yellow-400">
              <Coins className="h-2.5 w-2.5" />
              {coinBalance}
            </span>
          )}
        </span>
        {title && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 truncate leading-tight">
            {title}
          </span>
        )}
        {size === "sm" && (badgeCount > 0 || coinBalance !== null) && (
          <span className="flex items-center gap-1.5">
            {badgeCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                <Award className="h-2.5 w-2.5" />
                {badgeCount}
              </span>
            )}
            {coinBalance !== null && (
              <span className="flex items-center gap-0.5 text-[9px] font-semibold text-yellow-600 dark:text-yellow-400">
                <Coins className="h-2.5 w-2.5" />
                {coinBalance}
              </span>
            )}
          </span>
        )}
      </span>
    </span>
  );
}
