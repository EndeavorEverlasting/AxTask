import * as webPush from "web-push";
import { eq } from "drizzle-orm";
import { appRuntimeSecrets } from "@shared/schema";
import { db } from "../db";
import { log } from "../vite";

const VAPID_STORAGE_KEY = "web_push_vapid_keypair";

let initVapidAtBootPromise: Promise<void> | null = null;
let cachedPublicKey: string | null = null;
let webPushConfigured = false;

export function getVapidPublicKey(): string | null {
  return cachedPublicKey;
}

export function isWebPushVapidConfigured(): boolean {
  return webPushConfigured;
}

function readEnvPublicKey(): string {
  return (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "").trim();
}

function readEnvPrivateKey(): string {
  return (process.env.VAPID_PRIVATE_KEY || "").trim();
}

export function resolveVapidSubject(): string | null {
  const explicit = (process.env.VAPID_SUBJECT || "").trim();
  if (explicit) return explicit;

  const base = (process.env.BASE_URL || "").trim();
  if (base.startsWith("https://") || base.startsWith("http://")) {
    try {
      const u = new URL(base);
      if (u.protocol === "https:") return u.origin;
    } catch {
      /* ignore */
    }
  }

  const host = (process.env.CANONICAL_HOST || "").trim().toLowerCase();
  if (host) return `https://${host}`;

  const renderExternal = (process.env.RENDER_EXTERNAL_URL || "").trim();
  if (renderExternal.startsWith("https://")) {
    try {
      return new URL(renderExternal).origin;
    } catch {
      /* ignore */
    }
  }

  const replitDev = (process.env.REPLIT_DEV_DOMAIN || "").trim().toLowerCase();
  if (replitDev) return `https://${replitDev}`;

  if (process.env.NODE_ENV !== "production") {
    return "mailto:axtask-local@localhost";
  }

  return null;
}

async function loadOrCreateKeyPairFromDb(): Promise<{ publicKey: string; privateKey: string }> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[loadOrCreateKeyPairFromDb] Production must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; storing VAPID keys in the database is disabled when NODE_ENV=production.",
    );
  }
  const [existing] = await db
    .select()
    .from(appRuntimeSecrets)
    .where(eq(appRuntimeSecrets.key, VAPID_STORAGE_KEY))
    .limit(1);

  if (existing?.value) {
    try {
      const parsed = JSON.parse(existing.value) as { publicKey?: string; privateKey?: string };
      if (parsed.publicKey && parsed.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
      }
    } catch {
      /* fall through to regenerate */
    }
  }

  const generated = webPush.generateVAPIDKeys();
  const payload = JSON.stringify({
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
  });

  const inserted = await db
    .insert(appRuntimeSecrets)
    .values({
      key: VAPID_STORAGE_KEY,
      value: payload,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: appRuntimeSecrets.key })
    .returning({ key: appRuntimeSecrets.key });

  if (inserted.length > 0) {
    return { publicKey: generated.publicKey, privateKey: generated.privateKey };
  }

  const [again] = await db
    .select()
    .from(appRuntimeSecrets)
    .where(eq(appRuntimeSecrets.key, VAPID_STORAGE_KEY))
    .limit(1);
  if (!again?.value) {
    throw new Error("VAPID keypair missing after insert race");
  }
  const parsed = JSON.parse(again.value) as { publicKey?: string; privateKey?: string };
  if (!parsed.publicKey || !parsed.privateKey) {
    throw new Error("Stored VAPID keypair is invalid");
  }
  return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
}

/**
 * Loads explicit env keys, or creates/persists a VAPID pair in Postgres, then configures web-push.
 * Concurrent callers await the same in-flight initialization; configuration flags update only after async work finishes.
 */
export async function initVapidAtBoot(): Promise<void> {
  if (initVapidAtBootPromise) return initVapidAtBootPromise;

  initVapidAtBootPromise = (async () => {
    const subject = resolveVapidSubject();
    if (!subject) {
      log(
        "Web Push disabled: set VAPID_SUBJECT, BASE_URL (https), or CANONICAL_HOST for a VAPID contact URI.",
        "web-push",
      );
      return;
    }

    const envPublic = readEnvPublicKey();
    const envPrivate = readEnvPrivateKey();

    let pair: { publicKey: string; privateKey: string };

    try {
      if (envPublic && envPrivate) {
        pair = { publicKey: envPublic, privateKey: envPrivate };
      } else {
        if (process.env.NODE_ENV === "production") {
          log(
            "Web Push disabled in production: set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (DB key fallback is not allowed; see loadOrCreateKeyPairFromDb / NODE_ENV). Optional: ALLOW_DB_VAPID_FALLBACK is ignored in production.",
            "web-push",
          );
          return;
        }
        if (envPublic || envPrivate) {
          log(
            "Web Push: incomplete VAPID env (need both public and private, or neither); using auto-managed database keypair (non-production only).",
            "web-push",
          );
        }
        pair = await loadOrCreateKeyPairFromDb();
      }

      webPush.setVapidDetails(subject, pair.publicKey, pair.privateKey);
      cachedPublicKey = pair.publicKey;
      webPushConfigured = true;
      log("Web Push VAPID configured.", "web-push");
    } catch (e) {
      log(`Web Push bootstrap failed: ${e instanceof Error ? e.message : String(e)}`, "web-push");
    }
  })();

  return initVapidAtBootPromise;
}
