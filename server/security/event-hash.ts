import { createHash } from "crypto";

export function buildSecurityEventHash(input: {
  eventType: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  ipAddress?: string | null;
  userAgentHash?: string | null;
  payloadJson?: string | null;
  prevHash?: string | null;
  createdAtIso: string;
}): string {
  const base = [
    input.eventType || "",
    input.actorUserId || "",
    input.targetUserId || "",
    input.route || "",
    input.method || "",
    String(input.statusCode ?? ""),
    input.ipAddress || "",
    input.userAgentHash || "",
    input.payloadJson || "",
    input.prevHash || "",
    input.createdAtIso,
  ].join("|");
  return createHash("sha256").update(base).digest("hex");
}
