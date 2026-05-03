import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthConfigResponse = {
  donateUrl?: string;
};

type DonateCtaProps = {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
};

/**
 * Renders a donate link when `DONATE_URL` is set on the server (`/api/auth/config`).
 */
export function DonateCta({ className, variant = "outline", size = "default" }: DonateCtaProps) {
  const { data } = useQuery<AuthConfigResponse>({
    queryKey: ["/api/auth/config"],
  });
  const url = data?.donateUrl?.trim();
  if (!url) return null;

  return (
    <Button variant={variant} size={size} className={cn(className)} asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Heart className="h-4 w-4 mr-2 shrink-0" aria-hidden />
        Donate
      </a>
    </Button>
  );
}
