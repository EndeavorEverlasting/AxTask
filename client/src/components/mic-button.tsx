import { Mic, MicOff, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SpeechStatus } from "@/hooks/use-speech-recognition";

interface MicButtonProps {
  status: SpeechStatus;
  isSupported: boolean;
  onClick: () => void;
  error?: string | null;
  className?: string;
}

export function MicButton({ status, isSupported, onClick, error, className }: MicButtonProps) {
  if (!isSupported) return null;

  const tooltipText = status === "listening"
    ? "Stop listening (Ctrl+M)"
    : status === "error"
    ? error || "Microphone error — click to retry"
    : "Dictate (Ctrl+M)";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "relative flex items-center justify-center rounded-full w-9 h-9 shrink-0 transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              status === "idle" && "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 text-gray-500 dark:text-gray-400 hover:from-primary/10 hover:to-primary/20 dark:hover:from-primary/20 dark:hover:to-primary/30 hover:text-primary hover:shadow-md hover:scale-105 active:scale-95",
              status === "listening" && "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25 dark:shadow-red-500/40 scale-105",
              status === "error" && "bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 text-amber-600 dark:text-amber-400 hover:shadow-md",
              className
            )}
          >
            {status === "listening" && (
              <>
                <span className="absolute inset-0 rounded-full animate-ping bg-red-400/25" />
                <span className="absolute -inset-1 rounded-full animate-pulse bg-red-400/15" />
                <span className="absolute -inset-2 rounded-full animate-pulse bg-red-400/10" style={{ animationDelay: "150ms" }} />
              </>
            )}
            {status === "error" ? (
              <AlertCircle className="h-4 w-4 relative z-10" />
            ) : status === "listening" ? (
              <MicOff className="h-4 w-4 relative z-10" />
            ) : (
              <Mic className="h-4 w-4 relative z-10" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
