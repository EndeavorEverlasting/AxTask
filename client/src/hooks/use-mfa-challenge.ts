import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type MfaChallengeRequest =
  | string
  | { purpose: string; channel?: "email" | "sms"; phoneE164?: string; taskId?: string };

export type MfaChallengeResponse = {
  challengeId: string;
  expiresAt: string;
  deliveredVia?: "email" | "sms";
  maskedDestination?: string;
  devCode?: string;
};

function toRequestBody(input: MfaChallengeRequest): Record<string, string> {
  if (typeof input === "string") {
    return { purpose: input, channel: "email" };
  }
  const body: Record<string, string> = {
    purpose: input.purpose,
    channel: input.channel ?? "email",
  };
  if (input.phoneE164?.trim()) body.phoneE164 = input.phoneE164.trim();
  if (input.taskId?.trim()) body.taskId = input.taskId.trim();
  return body;
}

/**
 * Starts OTP challenges via POST /api/mfa/challenge (email or SMS when configured).
 * Pair with {@link MfaVerificationPanel} or a custom OTP UI.
 */
export function useMfaChallenge() {
  const mutation = useMutation({
    mutationFn: async (input: MfaChallengeRequest) => {
      const res = await apiRequest("POST", "/api/mfa/challenge", toRequestBody(input));
      return res.json() as Promise<MfaChallengeResponse>;
    },
  });

  return {
    requestChallenge: mutation.mutateAsync,
    isRequesting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
