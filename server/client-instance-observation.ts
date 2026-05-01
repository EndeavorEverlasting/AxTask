import type { Request } from "express";
import { AXTASK_CLIENT_INSTANCE_HEADER } from "@shared/http-auth";
import {
  hashClientInstanceIdForLedger,
  isClientInstanceIdWellFormed,
} from "./client-instance-crypto";
import { appendSecurityEvent } from "./storage";

/**
 * First authenticated `/api` request per session that sends a valid client instance header:
 * records `client_instance_observed` with UA hash + HMAC(instance id) in payload.
 */
export async function maybeRecordClientInstanceObservation(req: Request): Promise<void> {
  const userId = req.user?.id;
  if (!userId || !req.session) return;

  const sess = req.session as { clientInstanceObserved?: boolean };
  if (sess.clientInstanceObserved) return;

  const raw = req.get(AXTASK_CLIENT_INSTANCE_HEADER)?.trim();
  if (!raw || !isClientInstanceIdWellFormed(raw)) return;

  sess.clientInstanceObserved = true;

  await new Promise<void>((resolve, reject) => {
    req.session!.save((err) => (err ? reject(err) : resolve()));
  });

  await appendSecurityEvent({
    eventType: "client_instance_observed",
    actorUserId: userId,
    route: req.path,
    method: req.method,
    statusCode: 200,
    ipAddress: req.ip,
    userAgent: req.get("user-agent") || undefined,
    payload: {
      v: 1,
      instanceIdHash: hashClientInstanceIdForLedger(raw),
    },
  });
}
