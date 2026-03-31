import { Mic, MicOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SpeechStatus } from "@/hooks/use-speech-recognition";

interface MicButtonProps {
  status: SpeechStatus;
  isSupported: boolean;
  onClick: () => void;
  error?: string | null;
  className?: string;
  size?: "sm" | "default" | "icon";
}

export function MicButton({ status, isSupported, onClick, error, className, size = "icon" }: MicButtonProps) {
  if (!isSupported) return null;

  const tooltipText = status === "listening"
    ? "Stop listening"
    : status === "error"
    ? error || "Microphone error — click to retry"
    : "Click to dictate";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={status === "listening" ? "default" : "ghost"}
            size={size}
            onClick={onClick}
            className={cn(
              "relative shrink-0",
              status === "listening" && "bg-red-500 hover:bg-red-600 text-white",
              status === "error" && "text-amber-500 hover:text-amber-600",
              className
            )}
          >
            {status === "listening" && (
              <>
                <span className="absolute inset-0 rounded-md animate-ping bg-red-400/30" />
                <span className="absolute inset-0 rounded-md animate-pulse bg-red-400/20" />
              </>
            )}
            {status === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : status === "listening" ? (
              <MicOff className="h-4 w-4 relative z-10" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
