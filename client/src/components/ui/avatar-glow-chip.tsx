import * as React from "react";
import { cn } from "@/lib/utils";

const GLOW_BY_KEY: Record<string, string> = {
  mood: "avatar-glow-mood",
  archetype: "avatar-glow-archetype",
  productivity: "avatar-glow-productivity",
  social: "avatar-glow-social",
  lazy: "avatar-glow-lazy",
};

export function AvatarGlowChip({
  avatarKey,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  avatarKey: string;
}) {
  return <div className={cn("avatar-glow-chip", GLOW_BY_KEY[avatarKey] ?? "", className)} {...props} />;
}
