import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

/**
 * Logged-out visitor on a protected path: replace with `/?next=` so the landing page can explain and CTA to login.
 */
export function DeepLinkGate({ path }: { path: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const clean = path.split("?")[0] || "/";
    if (clean === "/" || !clean.startsWith("/")) {
      setLocation("/");
      return;
    }
    setLocation(`/?next=${encodeURIComponent(clean)}`);
  }, [path, setLocation]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-label="Redirecting" />
    </div>
  );
}
